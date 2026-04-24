import { IsoResponseCode } from '@atm/iso8583';
import { hashPin } from '@atm/shared';
import { HostEmulatorService } from './host-emulator.service';

/**
 * Unit tests — PrismaService is mocked. Integration against a real Postgres
 * is deferred to Phase 6 (docker-compose CI).
 */

type Card = {
  pan: string;
  pin: string;
  expiryDate: string;
  status: string;
  failedPinCount: number;
  accountId: string;
  account: {
    id: string;
    balance: bigint;
    dailyLimit: bigint;
    dailyWithdrawn: bigint;
    status: string;
    currency: string;
  };
};

function makeCard(over: Partial<Card> = {}): Card {
  const base: Card = {
    pan: '4580000000000001',
    pin: hashPin('1234'),
    expiryDate: '3012',
    status: 'ACTIVE',
    failedPinCount: 0,
    accountId: 'acc_1',
    account: {
      id: 'acc_1',
      balance: 5_000_000n,
      dailyLimit: 10_000_000n,
      dailyWithdrawn: 0n,
      status: 'ACTIVE',
      currency: 'IDR',
    },
  };
  return { ...base, ...over };
}

function buildPrismaMock(cards: Card[]) {
  const map = new Map<string, Card>(cards.map((c) => [c.pan, { ...c }]));

  return {
    virtualCard: {
      findUnique: jest.fn(({ where }: { where: { pan: string } }) =>
        Promise.resolve(map.get(where.pan) ?? null),
      ),
      update: jest.fn(
        ({ where, data }: { where: { pan: string }; data: Record<string, unknown> }) => {
          const existing = map.get(where.pan);
          if (!existing) throw new Error('not found');
          if ('failedPinCount' in data) {
            const v = data.failedPinCount as { increment?: number } | number;
            if (typeof v === 'object' && 'increment' in v) {
              existing.failedPinCount += v.increment ?? 0;
            } else if (typeof v === 'number') {
              existing.failedPinCount = v;
            }
          }
          if ('status' in data) {
            existing.status = data.status as string;
          }
          return Promise.resolve({ ...existing });
        },
      ),
    },
    account: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => {
        const existing = [...map.values()].find((c) => c.accountId === where.id)?.account;
        return Promise.resolve(existing ? { ...existing } : null);
      }),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const existing = [...map.values()].find((c) => c.accountId === where.id)?.account;
          if (!existing) throw new Error('not found');
          const bal = data.balance as { decrement?: bigint; increment?: bigint } | undefined;
          if (bal?.decrement) existing.balance -= bal.decrement;
          if (bal?.increment) existing.balance += bal.increment;
          const daily = data.dailyWithdrawn as
            | { increment?: bigint; decrement?: bigint }
            | undefined;
          if (daily?.increment) existing.dailyWithdrawn += daily.increment;
          if (daily?.decrement) existing.dailyWithdrawn -= daily.decrement;
          return Promise.resolve({ ...existing });
        },
      ),
    },
    transaction: {
      aggregate: jest.fn(() => Promise.resolve({ _sum: { amount: 0n } })),
      create: jest.fn(() => Promise.resolve({})),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    // Advisory-lock SELECT + any other raw queries issued inside the txn.
    $executeRawUnsafe: jest.fn(() => Promise.resolve(1)),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };

  function prismaMock() {
    // placeholder
  }
}

describe('HostEmulatorService', () => {
  function create(cards: Card[] = [makeCard()]) {
    const prisma = buildPrismaMock(cards);
    // The service uses $transaction(fn) — rebind it so `fn(tx)` receives prisma itself.
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
    const svc = new HostEmulatorService(prisma as never);
    return { svc, prisma };
  }

  describe('authenticate', () => {
    it('returns APPROVED for active valid card', async () => {
      const { svc } = create();
      const r = await svc.authenticate('4580000000000001');
      expect(r.success).toBe(true);
      expect(r.responseCode).toBe(IsoResponseCode.APPROVED);
    });

    it('rejects blocked card with 62', async () => {
      const { svc } = create([makeCard({ status: 'BLOCKED' })]);
      const r = await svc.authenticate('4580000000000001');
      expect(r.success).toBe(false);
      expect(r.responseCode).toBe(IsoResponseCode.CARD_BLOCKED);
    });

    it('rejects expired card with 54', async () => {
      const { svc } = create([makeCard({ expiryDate: '2001' })]);
      const r = await svc.authenticate('4580000000000001');
      expect(r.success).toBe(false);
      expect(r.responseCode).toBe(IsoResponseCode.EXPIRED_CARD);
    });

    it('rejects retained card', async () => {
      const { svc } = create([makeCard({ status: 'RETAINED' })]);
      const r = await svc.authenticate('4580000000000001');
      expect(r.success).toBe(false);
    });

    it('rejects missing card', async () => {
      const { svc } = create([]);
      const r = await svc.authenticate('9999999999999999');
      expect(r.success).toBe(false);
      expect(r.responseCode).toBe(IsoResponseCode.INVALID_CARD);
    });
  });

  describe('verifyPin', () => {
    it('approves correct PIN', async () => {
      const { svc } = create();
      const r = await svc.verifyPin('4580000000000001', '1234');
      expect(r.success).toBe(true);
    });

    it('rejects wrong PIN and increments failure count', async () => {
      const { svc, prisma } = create();
      const r = await svc.verifyPin('4580000000000001', '9999');
      expect(r.success).toBe(false);
      expect(r.responseCode).toBe(IsoResponseCode.INCORRECT_PIN);
      expect(prisma.virtualCard.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { failedPinCount: { increment: 1 } } }),
      );
    });

    it('returns PIN_TRIES_EXCEEDED after 3 failures', async () => {
      const { svc } = create([makeCard({ failedPinCount: 2 })]);
      const r = await svc.verifyPin('4580000000000001', '9999');
      expect(r.responseCode).toBe(IsoResponseCode.PIN_TRIES_EXCEEDED);
    });

    it('resets failure count on success', async () => {
      const { svc, prisma } = create([makeCard({ failedPinCount: 2 })]);
      await svc.verifyPin('4580000000000001', '1234');
      expect(prisma.virtualCard.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { failedPinCount: 0 } }),
      );
    });
  });

  describe('authorizeWithdrawal', () => {
    it('approves within balance and limit', async () => {
      const { svc } = create();
      const r = await svc.authorizeWithdrawal({
        pan: '4580000000000001',
        amount: 500_000,
        sessionId: 'sess_1',
      });
      expect(r.approved).toBe(true);
      expect(r.balanceAfter).toBe(4_500_000);
    });

    it('declines insufficient funds with 51', async () => {
      const { svc } = create([makeCard({ account: { ...makeCard().account, balance: 100_000n } })]);
      const r = await svc.authorizeWithdrawal({
        pan: '4580000000000001',
        amount: 500_000,
        sessionId: 'sess_1',
      });
      expect(r.approved).toBe(false);
      expect(r.responseCode).toBe(IsoResponseCode.NOT_SUFFICIENT_FUNDS);
    });

    it('declines over-limit with 61', async () => {
      const { svc, prisma } = create();
      prisma.transaction.aggregate = jest.fn(() =>
        Promise.resolve({ _sum: { amount: 9_500_000n } }),
      ) as never;
      const r = await svc.authorizeWithdrawal({
        pan: '4580000000000001',
        amount: 1_000_000,
        sessionId: 'sess_1',
      });
      expect(r.approved).toBe(false);
      expect(r.responseCode).toBe(IsoResponseCode.EXCEEDS_WITHDRAWAL_LIMIT);
    });

    it('acquires advisory lock before reading balance', async () => {
      const { svc, prisma } = create();
      await svc.authorizeWithdrawal({
        pan: '4580000000000001',
        amount: 500_000,
        sessionId: 'sess_1',
      });
      // Lock SQL must be issued, with a bigint-ish numeric key (as a string
      // since pg_advisory_xact_lock takes bigint).
      const calls = (prisma.$executeRawUnsafe as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const [sql, key] = calls[0] as [string, string];
      expect(sql).toMatch(/pg_advisory_xact_lock/);
      expect(typeof key).toBe('string');
      expect(/^\d+$/.test(key)).toBe(true);
    });

    it('reverseTransaction also acquires advisory lock', async () => {
      const { svc, prisma } = create();
      await svc.reverseTransaction({
        stanNo: '000001',
        sessionId: 'sess_1',
        pan: '4580000000000001',
        accountId: 'acc_1',
        amount: 100_000,
        reason: 'dispense failed',
      });
      expect((prisma.$executeRawUnsafe as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getBalance', () => {
    it('returns approved balance for active card', async () => {
      const { svc } = create();
      const r = await svc.getBalance('4580000000000001');
      expect(r.amount).toBe(5_000_000);
      expect(r.responseCode).toBe(IsoResponseCode.APPROVED);
    });

    it('returns invalid card for unknown pan', async () => {
      const { svc } = create([]);
      const r = await svc.getBalance('9999');
      expect(r.responseCode).toBe(IsoResponseCode.INVALID_CARD);
    });
  });
});
