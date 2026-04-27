import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsoResponseCode } from '@atm/iso8583';
import { formatStan } from '@atm/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Produce a stable 63-bit signed integer key for pg_advisory_xact_lock(bigint).
 * SHA-1 of the accountId, first 8 bytes as a big-endian int, masked to fit
 * the signed bigint positive range.
 */
function accountLockKey(accountId: string): string {
  const digest = createHash('sha1').update(accountId).digest();
  // Take first 8 bytes as big-endian, mask top bit so it's a positive bigint.
  const n = digest.readBigUInt64BE(0) & 0x7fffffffffffffffn;
  return n.toString();
}

export interface AuthResult {
  success: boolean;
  accountId?: string;
  responseCode: string;
  reason?: string;
}

export interface AuthorizationResult {
  approved: boolean;
  responseCode: string;
  authCode?: string;
  stanNo: string;
  balanceAfter?: number;
  reason?: string;
}

export interface BalanceResult {
  amount: number;
  currency: string;
  responseCode: string;
}

/**
 * Mock ISO 8583 host.
 *
 * The real thing would exchange MTI 0100/0200/0400/0800 messages over TCP
 * with an issuer host. Here we:
 *   - look up the card + account in Postgres
 *   - check card status, expiry, daily limit, balance
 *   - return an ISO 8583 response code (Field 39)
 *
 * Concurrency: withdrawals run inside a Prisma $transaction that acquires
 * a Postgres transaction-scoped advisory lock keyed by accountId before
 * reading balance. This serialises concurrent authorizations on the same
 * account so the read-then-decrement sequence cannot race. The daily-limit
 * check uses an aggregate SUM over COMPLETED WITHDRAWAL transactions as the
 * authoritative source — Account.dailyWithdrawn is only a UI hint.
 */
@Injectable()
export class HostEmulatorService {
  private readonly logger = new Logger(HostEmulatorService.name);
  private stanCounter = 1;

  constructor(private readonly prisma: PrismaService) {}

  async authenticate(pan: string): Promise<AuthResult> {
    const card = await this.prisma.virtualCard.findUnique({
      where: { pan },
      include: { account: true },
    });

    if (!card) {
      return {
        success: false,
        responseCode: IsoResponseCode.INVALID_CARD,
        reason: 'card not found',
      };
    }

    if (card.status === 'BLOCKED') {
      return { success: false, responseCode: IsoResponseCode.CARD_BLOCKED, reason: 'card blocked' };
    }

    if (card.status === 'RETAINED') {
      return {
        success: false,
        responseCode: IsoResponseCode.RESTRICTED_CARD,
        reason: 'card retained',
      };
    }

    if (this.isExpired(card.expiryDate)) {
      return {
        success: false,
        responseCode: IsoResponseCode.EXPIRED_CARD,
        reason: 'card expired',
      };
    }

    if (!card.account || card.account.status !== 'ACTIVE') {
      return {
        success: false,
        responseCode: IsoResponseCode.NO_CARD_RECORD,
        reason: 'account not active',
      };
    }

    return {
      success: true,
      accountId: card.accountId,
      responseCode: IsoResponseCode.APPROVED,
    };
  }

  async verifyPin(pan: string, enteredPin: string): Promise<AuthResult> {
    const { verifyPin } = await import('@atm/shared');
    const card = await this.prisma.virtualCard.findUnique({ where: { pan } });
    if (!card) {
      return {
        success: false,
        responseCode: IsoResponseCode.INVALID_CARD,
        reason: 'card not found',
      };
    }

    const ok = verifyPin(enteredPin, card.pin);
    if (!ok) {
      const updated = await this.prisma.virtualCard.update({
        where: { pan },
        data: { failedPinCount: { increment: 1 } },
      });
      const reason =
        updated.failedPinCount >= 3
          ? 'pin tries exceeded — card will be retained'
          : 'incorrect pin';
      const code =
        updated.failedPinCount >= 3
          ? IsoResponseCode.PIN_TRIES_EXCEEDED
          : IsoResponseCode.INCORRECT_PIN;
      return { success: false, responseCode: code, reason };
    }

    // Reset failed count on success.
    await this.prisma.virtualCard.update({ where: { pan }, data: { failedPinCount: 0 } });
    return { success: true, responseCode: IsoResponseCode.APPROVED };
  }

  async authorizeWithdrawal(params: {
    pan: string;
    amount: number;
    sessionId: string;
  }): Promise<AuthorizationResult> {
    const stanNo = this.generateStan();

    try {
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const card = await tx.virtualCard.findUnique({
          where: { pan: params.pan },
          include: { account: true },
        });

        if (!card?.account) {
          return {
            approved: false,
            responseCode: IsoResponseCode.INVALID_CARD,
            stanNo,
            reason: 'card not found',
          };
        }

        // Serialize concurrent authorizations against the same account via a
        // Postgres transaction-scoped advisory lock. The lock is released when
        // the surrounding $transaction commits or rolls back — no cleanup.
        // Key: 32-bit hash of accountId fits into pg_advisory_xact_lock(bigint).
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock($1::bigint)`,
          accountLockKey(card.accountId),
        );

        // Re-read after acquiring the lock so balance reflects any sibling
        // transaction that just committed.
        const locked = await tx.account.findUnique({ where: { id: card.accountId } });
        if (!locked) {
          return {
            approved: false,
            responseCode: IsoResponseCode.NO_CARD_RECORD,
            stanNo,
            reason: 'account not found',
          };
        }

        const balance = Number(locked.balance);
        if (balance < params.amount) {
          return {
            approved: false,
            responseCode: IsoResponseCode.NOT_SUFFICIENT_FUNDS,
            stanNo,
            reason: 'insufficient funds',
          };
        }

        // Recompute daily withdrawn from transactions table — authoritative.
        // The Account.dailyWithdrawn column is a cached hint only.
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const dailyTotal = await tx.transaction.aggregate({
          where: {
            accountId: card.accountId,
            status: 'COMPLETED',
            txnType: 'WITHDRAWAL',
            createdAt: { gte: startOfDay },
          },
          _sum: { amount: true },
        });
        const alreadyWithdrawn = Number(dailyTotal._sum.amount ?? 0);
        const dailyLimit = Number(card.account.dailyLimit);

        if (alreadyWithdrawn + params.amount > dailyLimit) {
          return {
            approved: false,
            responseCode: IsoResponseCode.EXCEEDS_WITHDRAWAL_LIMIT,
            stanNo,
            reason: `daily limit (${dailyLimit}) exceeded; already withdrawn ${alreadyWithdrawn}`,
          };
        }

        // Approve + deduct atomically.
        const updated = await tx.account.update({
          where: { id: card.accountId },
          data: {
            balance: { decrement: BigInt(params.amount) },
            dailyWithdrawn: { increment: BigInt(params.amount) },
          },
        });

        const authCode = this.generateAuthCode();

        await tx.transaction.create({
          data: {
            sessionId: params.sessionId,
            pan: params.pan,
            accountId: card.accountId,
            txnType: 'WITHDRAWAL',
            amount: BigInt(params.amount),
            currency: 'IDR',
            status: 'COMPLETED',
            stanNo,
            authCode,
            responseCode: IsoResponseCode.APPROVED,
          },
        });

        return {
          approved: true,
          responseCode: IsoResponseCode.APPROVED,
          authCode,
          stanNo,
          balanceAfter: Number(updated.balance),
        };
      });

      return result;
    } catch (err) {
      this.logger.error(`authorizeWithdrawal failed: ${String(err)}`);
      return {
        approved: false,
        responseCode: IsoResponseCode.SYSTEM_MALFUNCTION,
        stanNo,
        reason: 'host error',
      };
    }
  }

  async getBalance(pan: string): Promise<BalanceResult> {
    const card = await this.prisma.virtualCard.findUnique({
      where: { pan },
      include: { account: true },
    });
    if (!card?.account) {
      return {
        amount: 0,
        currency: 'IDR',
        responseCode: IsoResponseCode.INVALID_CARD,
      };
    }
    return {
      amount: Number(card.account.balance),
      currency: card.account.currency,
      responseCode: IsoResponseCode.APPROVED,
    };
  }

  /**
   * Reverse a previously authorised withdrawal after a dispense failure.
   * Credits balance back, logs a REVERSED transaction.
   */
  async reverseTransaction(params: {
    stanNo: string;
    sessionId: string;
    pan: string;
    accountId: string;
    amount: number;
    reason: string;
  }): Promise<void> {
    this.logger.warn(`reversing STAN=${params.stanNo} reason=${params.reason}`);
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Same advisory lock as authorize — the reversal must not race against
      // a concurrent authorization on the same account.
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock($1::bigint)`,
        accountLockKey(params.accountId),
      );
      await tx.account.update({
        where: { id: params.accountId },
        data: {
          balance: { increment: BigInt(params.amount) },
          dailyWithdrawn: { decrement: BigInt(params.amount) },
        },
      });
      await tx.transaction.updateMany({
        where: { stanNo: params.stanNo, status: 'COMPLETED' },
        data: { status: 'REVERSED', errorReason: params.reason },
      });
      await tx.transaction.create({
        data: {
          sessionId: params.sessionId,
          pan: params.pan,
          accountId: params.accountId,
          txnType: 'WITHDRAWAL',
          amount: BigInt(params.amount),
          currency: 'IDR',
          status: 'REVERSED',
          stanNo: params.stanNo,
          errorReason: params.reason,
        },
      });
    });
  }

  /** Manually mark a card as retained. */
  async retainCard(pan: string): Promise<void> {
    await this.prisma.virtualCard.update({
      where: { pan },
      data: { status: 'RETAINED' },
    });
    this.logger.warn(`card retained: ${pan}`);
  }

  private isExpired(expiryDate: string): boolean {
    // Format: YYMM. Consider expired if year < now or (year == now && month < now).
    if (!/^\d{4}$/.test(expiryDate)) return true;
    const yy = parseInt(expiryDate.slice(0, 2), 10);
    const mm = parseInt(expiryDate.slice(2, 4), 10);
    const year = 2000 + yy;
    const now = new Date();
    const nowYear = now.getUTCFullYear();
    const nowMonth = now.getUTCMonth() + 1;
    if (year < nowYear) return true;
    if (year === nowYear && mm < nowMonth) return true;
    return false;
  }

  private generateStan(): string {
    return formatStan(this.stanCounter++);
  }

  private generateAuthCode(): string {
    return Math.floor(100_000 + Math.random() * 900_000).toString();
  }
}
