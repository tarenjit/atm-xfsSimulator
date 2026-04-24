import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CDM_CMD, IDC_CMD, PIN_CMD, PTR_CMD, XfsResult, XfsServiceClass } from '@atm/xfs-core';
import {
  CdmDeviceService,
  IdcDeviceService,
  PinDeviceService,
  PtrDeviceService,
  VirtualCard,
} from '@atm/xfs-devices';
import { IsoResponseCode, isApproved } from '@atm/iso8583';
import { newRequestId, newSessionId } from '@atm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { HostEmulatorService } from '../host/host-emulator.service';
import { XfsManagerService } from '../xfs/xfs-manager.service';
import { AtmSession, AtmState, AtmTxnType } from './atm-session.types';
import { UserAction } from './user-action.types';

const MAX_PIN_ATTEMPTS = 3;

/**
 * States where the session is waiting on human input — idle timer applies
 * only to these. Machine-driven states (PROCESSING, DISPENSING, PRINTING,
 * EJECTING) have their own per-XFS-command timeouts and must not be
 * interrupted by the idle watchdog.
 */
const IDLE_TIMEOUT_STATES = new Set<AtmState>([
  'CARD_INSERTED',
  'PIN_ENTRY',
  'PIN_VERIFIED',
  'MAIN_MENU',
  'AMOUNT_ENTRY',
  'CONFIRM',
]);

/**
 * Auto-cancel session if no transition within this window (ms).
 * Overridable via ATM_IDLE_TIMEOUT_MS env var — tests set a low value and
 * the getter reads fresh on each arm so a late env change applies.
 */
function idleTimeoutMs(): number {
  const raw = process.env.ATM_IDLE_TIMEOUT_MS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

/**
 * AtmAppService — the ATM's transaction brain.
 *
 * Holds the active session (single-user model, matches physical ATMs) and
 * drives the XFS devices through a clean state machine.
 *
 * Emits 'atm.stateChanged' on every transition so the frontend and operator
 * console can re-render without polling. The session is persisted to
 * AtmSession on start/end so Phase 6 replay has a source.
 */
@Injectable()
export class AtmAppService implements OnModuleDestroy {
  private readonly logger = new Logger(AtmAppService.name);
  private session: AtmSession | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private readonly bankName = process.env.ATM_BANK_NAME ?? 'Bank Zegen';
  private readonly atmId = process.env.ATM_TERMINAL_ID ?? 'ZGN-001';

  constructor(
    private readonly xfs: XfsManagerService,
    private readonly host: HostEmulatorService,
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly idc: IdcDeviceService,
    private readonly pin: PinDeviceService,
    private readonly cdm: CdmDeviceService,
    // `ptr` is kept for symmetry and future printer-first flows.
    private readonly ptr: PtrDeviceService,
  ) {
    void this.ptr; // suppress unused warning without removing from DI
  }

  getSession(): AtmSession | null {
    return this.session;
  }

  /**
   * Entry point when a customer inserts a card (from the operator console,
   * REST, or the ATM UI). Persists the session, reads tracks, authenticates
   * the card against the host, and moves to PIN_ENTRY.
   */
  async onCardInserted(pan: string, card: VirtualCard): Promise<AtmSession> {
    if (this.session) {
      throw new Error('Session already active');
    }

    const session: AtmSession = {
      id: newSessionId(),
      state: 'CARD_INSERTED',
      cardPan: pan,
      failedPinAttempts: 0,
      startedAt: new Date(),
      updatedAt: new Date(),
    };
    this.session = session;
    await this.prisma.atmSession.create({
      data: { id: session.id, state: session.state, pan },
    });
    this.emitUserAction({
      kind: 'CARD_INSERT',
      pan,
      sessionId: session.id,
      timestamp: new Date().toISOString(),
    });
    this.notifyState('IDLE');

    // Physically insert into the IDC device so subsequent XFS calls work.
    const inserted = this.idc.insertCard(card);
    if (!inserted.inserted) {
      await this.markError(`insert rejected: ${inserted.reason ?? 'unknown'}`);
      return session;
    }

    // Read tracks (XFS_CMD_IDC_READ_TRACK).
    const readResult = await this.xfs.execute({
      hService: IdcDeviceService.HSERVICE,
      serviceClass: XfsServiceClass.IDC,
      commandCode: IDC_CMD.READ_TRACK,
      requestId: newRequestId(),
      timeoutMs: 5_000,
      payload: { tracks: [1, 2] },
      timestamp: new Date().toISOString(),
      sessionId: session.id,
    });
    if (readResult.result !== XfsResult.SUCCESS) {
      await this.markError(`IDC read failed: ${readResult.errorDetail ?? 'unknown'}`);
      return session;
    }

    // Authenticate card with host.
    const auth = await this.host.authenticate(pan);
    if (!auth.success) {
      await this.markError(`card declined: ${auth.reason ?? auth.responseCode}`);
      return session;
    }

    session.accountId = auth.accountId;
    this.transitionTo('PIN_ENTRY');
    return session;
  }

  /**
   * Begin a buffered PIN entry on the EPP. Caller presses keys via
   * pin.pressKey(); this resolves when the PIN is accepted.
   */
  async beginPinEntry(): Promise<{ verified: boolean; reason?: string }> {
    if (!this.session || this.session.state !== 'PIN_ENTRY') {
      throw new Error(`cannot begin PIN entry in state=${this.session?.state ?? 'none'}`);
    }

    try {
      await this.xfs.execute({
        hService: PinDeviceService.HSERVICE,
        serviceClass: XfsServiceClass.PIN,
        commandCode: PIN_CMD.GET_PIN,
        requestId: newRequestId(),
        timeoutMs: 60_000,
        payload: {
          minLen: 4,
          maxLen: 6,
          autoEnd: false,
          activeKeys: [
            '0',
            '1',
            '2',
            '3',
            '4',
            '5',
            '6',
            '7',
            '8',
            '9',
            'ENTER',
            'CANCEL',
            'CLEAR',
          ],
          activeFDKs: [],
          terminateKeys: ['ENTER'],
        },
        timestamp: new Date().toISOString(),
        sessionId: this.session.id,
      });
    } catch {
      await this.markError('pin entry failed or cancelled');
      return { verified: false, reason: 'pin entry failed or cancelled' };
    }

    return this.verifyPinBuffer();
  }

  /**
   * Verify the buffered PIN against the card. Increments failedPinCount and
   * retains after MAX_PIN_ATTEMPTS failures.
   */
  async verifyPinBuffer(): Promise<{ verified: boolean; reason?: string }> {
    if (!this.session) return { verified: false, reason: 'no session' };
    const entered = this.pin.extractEnteredPin();
    if (!entered) return { verified: false, reason: 'no pin entered' };

    const result = await this.host.verifyPin(this.session.cardPan!, entered);
    if (!result.success) {
      this.session.failedPinAttempts += 1;
      if (
        this.session.failedPinAttempts >= MAX_PIN_ATTEMPTS ||
        result.responseCode === IsoResponseCode.PIN_TRIES_EXCEEDED
      ) {
        await this.retainCard(result.reason ?? 'pin tries exceeded');
        return { verified: false, reason: 'card retained' };
      }
      return { verified: false, reason: result.reason };
    }

    this.transitionTo('PIN_VERIFIED');
    this.transitionTo('MAIN_MENU');
    return { verified: true };
  }

  async selectTransaction(txn: AtmTxnType): Promise<void> {
    if (!this.session || this.session.state !== 'MAIN_MENU') {
      throw new Error(`cannot select transaction in state=${this.session?.state ?? 'none'}`);
    }
    this.emitUserAction({
      kind: 'SELECT_TRANSACTION',
      txnType: txn,
      sessionId: this.session.id,
      timestamp: new Date().toISOString(),
    });
    this.session.selectedTxn = txn;
    if (txn === 'BALANCE') {
      await this.processBalance();
    } else if (txn === 'WITHDRAWAL') {
      this.transitionTo('AMOUNT_ENTRY');
    } else {
      await this.markError(`transaction type not supported: ${txn}`);
    }
  }

  async submitAmount(amount: number): Promise<void> {
    if (!this.session || this.session.state !== 'AMOUNT_ENTRY') {
      throw new Error(`cannot submit amount in state=${this.session?.state ?? 'none'}`);
    }
    if (!Number.isInteger(amount) || amount <= 0 || amount % 20_000 !== 0) {
      throw new Error('amount must be a positive multiple of 20000 IDR');
    }
    this.emitUserAction({
      kind: 'SUBMIT_AMOUNT',
      amount,
      sessionId: this.session.id,
      timestamp: new Date().toISOString(),
    });
    this.session.amount = amount;
    this.transitionTo('CONFIRM');
  }

  async confirmTransaction(): Promise<void> {
    if (!this.session || this.session.state !== 'CONFIRM') {
      throw new Error(`cannot confirm in state=${this.session?.state ?? 'none'}`);
    }
    this.emitUserAction({
      kind: 'CONFIRM',
      sessionId: this.session.id,
      timestamp: new Date().toISOString(),
    });
    this.transitionTo('PROCESSING');

    if (this.session.selectedTxn === 'WITHDRAWAL') {
      await this.processWithdrawal();
    } else {
      await this.markError('unsupported transaction');
    }
  }

  async cancelTransaction(reason = 'user cancelled'): Promise<void> {
    if (!this.session) return;
    this.emitUserAction({
      kind: 'CANCEL',
      reason,
      sessionId: this.session.id,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`cancel session ${this.session.id}: ${reason}`);
    await this.safeEject();
    await this.endSession('CANCELLED');
  }

  /** Central emit point for recorder subscribers. */
  private emitUserAction(action: UserAction): void {
    this.events.emit('atm.userAction', action);
  }

  private async processWithdrawal(): Promise<void> {
    if (!this.session?.amount) return;

    const auth = await this.host.authorizeWithdrawal({
      pan: this.session.cardPan!,
      amount: this.session.amount,
      sessionId: this.session.id,
    });

    if (!auth.approved) {
      await this.markError(auth.reason ?? `host declined (${auth.responseCode})`);
      return;
    }

    this.session.stanNo = auth.stanNo;
    this.session.authCode = auth.authCode;
    this.transitionTo('DISPENSING');

    const dispense = await this.xfs.execute({
      hService: CdmDeviceService.HSERVICE,
      serviceClass: XfsServiceClass.CDM,
      commandCode: CDM_CMD.DISPENSE,
      requestId: newRequestId(),
      timeoutMs: 30_000,
      payload: {
        amount: this.session.amount,
        currency: 'IDR',
        mixType: 'MIN_NOTES',
        present: true,
      },
      timestamp: new Date().toISOString(),
      sessionId: this.session.id,
    });

    if (dispense.result !== XfsResult.SUCCESS) {
      this.logger.error(`dispense failed: ${dispense.errorDetail}`);
      await this.host.reverseTransaction({
        stanNo: auth.stanNo,
        sessionId: this.session.id,
        pan: this.session.cardPan!,
        accountId: this.session.accountId!,
        amount: this.session.amount,
        reason: dispense.errorDetail ?? 'dispense failed',
      });
      await this.markError(`dispense failed: ${dispense.errorDetail}`);
      return;
    }

    // Print receipt.
    this.transitionTo('PRINTING');
    await this.xfs.execute({
      hService: PtrDeviceService.HSERVICE,
      serviceClass: XfsServiceClass.PTR,
      commandCode: PTR_CMD.PRINT_FORM,
      requestId: newRequestId(),
      timeoutMs: 5_000,
      payload: {
        formName: 'RECEIPT',
        mediaType: 'RECEIPT',
        cut: true,
        fields: {
          bankName: this.bankName,
          atmId: this.atmId,
          traceNo: auth.stanNo,
          txnType: 'WITHDRAWAL',
          cardLast4: this.session.cardPan!.slice(-4),
          amount: this.session.amount.toLocaleString('id-ID'),
          total: this.session.amount.toLocaleString('id-ID'),
          balance: auth.balanceAfter?.toLocaleString('id-ID') ?? '***',
        },
      },
      timestamp: new Date().toISOString(),
      sessionId: this.session.id,
    });

    // Eject card.
    this.transitionTo('EJECTING');
    await this.safeEject();
    await this.endSession('COMPLETED');
  }

  private async processBalance(): Promise<void> {
    if (!this.session) return;
    this.transitionTo('PROCESSING');

    const balance = await this.host.getBalance(this.session.cardPan!);
    if (!isApproved(balance.responseCode)) {
      await this.markError(`balance inquiry declined (${balance.responseCode})`);
      return;
    }

    this.transitionTo('PRINTING');
    await this.xfs.execute({
      hService: PtrDeviceService.HSERVICE,
      serviceClass: XfsServiceClass.PTR,
      commandCode: PTR_CMD.PRINT_FORM,
      requestId: newRequestId(),
      timeoutMs: 5_000,
      payload: {
        formName: 'RECEIPT',
        mediaType: 'RECEIPT',
        cut: true,
        fields: {
          bankName: this.bankName,
          atmId: this.atmId,
          txnType: 'BALANCE INQUIRY',
          cardLast4: this.session.cardPan!.slice(-4),
          balance: balance.amount.toLocaleString('id-ID'),
        },
      },
      timestamp: new Date().toISOString(),
      sessionId: this.session.id,
    });

    this.transitionTo('EJECTING');
    await this.safeEject();
    await this.endSession('COMPLETED');
  }

  private async retainCard(reason: string): Promise<void> {
    if (!this.session) return;
    this.logger.warn(`retaining card for session ${this.session.id}: ${reason}`);
    await this.xfs.execute({
      hService: IdcDeviceService.HSERVICE,
      serviceClass: XfsServiceClass.IDC,
      commandCode: IDC_CMD.RETAIN_CARD,
      requestId: newRequestId(),
      timeoutMs: 5_000,
      payload: {},
      timestamp: new Date().toISOString(),
      sessionId: this.session.id,
    });
    await this.host.retainCard(this.session.cardPan!);
    this.session.errorMessage = reason;
    this.transitionTo('ERROR');
    await this.endSession('ERROR');
  }

  private async safeEject(): Promise<void> {
    if (!this.idc.hasCard()) return;
    try {
      await this.xfs.execute({
        hService: IdcDeviceService.HSERVICE,
        serviceClass: XfsServiceClass.IDC,
        commandCode: IDC_CMD.EJECT_CARD,
        requestId: newRequestId(),
        timeoutMs: 5_000,
        payload: {},
        timestamp: new Date().toISOString(),
        sessionId: this.session?.id,
      });
    } catch (err) {
      this.logger.error(`eject failed: ${String(err)}`);
    }
  }

  private async markError(msg: string): Promise<void> {
    if (!this.session) return;
    this.logger.error(`session ${this.session.id}: ${msg}`);
    this.session.errorMessage = msg;
    this.transitionTo('ERROR');
    await this.safeEject();
    await this.endSession('ERROR');
  }

  private transitionTo(next: AtmState): void {
    if (!this.session) return;
    const prev = this.session.state;
    this.session.state = next;
    this.session.updatedAt = new Date();
    this.logger.log(`state: ${prev} → ${next}`);
    this.events.emit('atm.stateChanged', { session: { ...this.session }, previousState: prev });
    this.armIdleTimer(next);
  }

  private notifyState(prev: AtmState): void {
    if (!this.session) return;
    this.events.emit('atm.stateChanged', {
      session: { ...this.session },
      previousState: prev,
    });
    this.armIdleTimer(this.session.state);
  }

  private async endSession(reason: 'COMPLETED' | 'CANCELLED' | 'TIMEOUT' | 'ERROR'): Promise<void> {
    if (!this.session) return;
    this.clearIdleTimer();
    const session = this.session;
    session.endedAt = new Date();
    session.endReason = reason;
    await this.prisma.atmSession.update({
      where: { id: session.id },
      data: {
        state: session.state,
        endedAt: session.endedAt,
        endReason: reason,
        accountId: session.accountId,
      },
    });
    this.transitionTo('ENDED');
    this.session = null;
    this.events.emit('atm.sessionEnded', { session, reason });
  }

  /**
   * Arm (or re-arm) the inactivity watchdog. Only runs while the session is
   * in a state that awaits human input; machine-driven states clear the
   * timer to avoid interrupting a running dispense/print cycle.
   */
  private armIdleTimer(state: AtmState): void {
    this.clearIdleTimer();
    if (!IDLE_TIMEOUT_STATES.has(state)) return;
    const sessionId = this.session?.id;
    const ms = idleTimeoutMs();
    this.idleTimer = setTimeout(() => {
      // Only fire if the captured sessionId is still the active one.
      if (!this.session || this.session.id !== sessionId) return;
      this.logger.warn(`session ${sessionId} idle for ${ms}ms — auto-cancelling`);
      void this.handleIdleTimeout();
    }, ms);
    // unref so the timer never holds a shutting-down process open.
    this.idleTimer.unref?.();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private async handleIdleTimeout(): Promise<void> {
    if (!this.session) return;
    this.session.errorMessage = 'session timed out';
    this.transitionTo('ERROR');
    await this.safeEject();
    await this.endSession('TIMEOUT');
  }

  onModuleDestroy(): void {
    this.clearIdleTimer();
  }
}
