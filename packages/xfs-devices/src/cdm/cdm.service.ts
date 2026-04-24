import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CDM_CMD,
  CDM_EVT,
  CashUnit,
  CashUnitInfoResult,
  CdmCapabilities,
  CdmCountResult,
  CdmDispensePayload,
  CdmDispenseResult,
  CdmPresentResult,
  XfsServiceClass,
} from '@atm/xfs-core';
import { VirtualDeviceBase } from '../base/virtual-device.base';

/**
 * CDM — Cash Dispenser Module.
 *
 * Internal state:
 *   - cashUnits: cassette counts (mutable in-memory; persisted snapshots in DB)
 *   - presentedCash: last dispense result awaiting PRESENT/RETRACT
 *
 * Denomination selection: greedy min-notes by default. Caller can override
 * with mixType='CUSTOM' and an explicit customMix.
 */
@Injectable()
export class CdmDeviceService extends VirtualDeviceBase {
  static readonly HSERVICE = 'CDM30';
  private static readonly TAKE_TIMEOUT_MS = 3_000;

  private cashUnits = new Map<string, CashUnit>();
  private presentedCash: { amount: number; notes: Record<string, number> } | null = null;
  private takeTimer: NodeJS.Timeout | null = null;

  constructor(events: EventEmitter2) {
    super(XfsServiceClass.CDM, CdmDeviceService.HSERVICE, events);
    this.initializeCassettes();
    this.open();
  }

  getCapabilities(): CdmCapabilities {
    return {
      serviceClass: XfsServiceClass.CDM,
      version: '3.30',
      type: 'SELF_SERVICE',
      maxCassettes: 6,
      currency: 'IDR',
      canPresent: true,
      canRetract: true,
      canRetain: true,
    };
  }

  async executeCommand(commandCode: string, payload: unknown): Promise<unknown> {
    await this.simulateDelay();

    // RESET always runs — escape hatch from injected errors / stuck state.
    if (commandCode === CDM_CMD.RESET) {
      this.cancelTakeTimer();
      this.presentedCash = null;
      this.reset();
      return {};
    }

    const injected = this.checkInjectedError();
    if (injected !== null) {
      throw new Error(`XFS injected error: ${injected}`);
    }

    switch (commandCode) {
      case CDM_CMD.DISPENSE:
        return this.dispense(payload as CdmDispensePayload);
      case CDM_CMD.PRESENT:
        return this.present();
      case CDM_CMD.RETRACT:
      case CDM_CMD.REJECT:
        return this.retract();
      case CDM_CMD.CASH_UNIT_INFO:
        return this.getCashUnitInfo();
      case CDM_CMD.COUNT:
        return this.count();
      case CDM_CMD.START_EXCHANGE:
      case CDM_CMD.END_EXCHANGE:
        // Exchange state not modelled beyond an ack. A real device flips to
        // EXCHANGE state to allow cassette swap.
        return { ok: true };
      default:
        throw new Error(`Unsupported CDM command: ${commandCode}`);
    }
  }

  replenishCassette(unitId: string, newCount: number): CashUnit {
    const unit = this.cashUnits.get(unitId);
    if (!unit) throw new Error(`Unknown cassette: ${unitId}`);
    if (newCount < 0 || newCount > unit.maximum) {
      throw new Error(`replenish out of range: 0..${unit.maximum}`);
    }
    unit.count = newCount;
    unit.status = newCount === 0 ? 'EMPTY' : newCount <= unit.minimum ? 'LOW' : 'OK';
    this.logger.log(`replenished ${unitId} to ${newCount} (${unit.status})`);
    return unit;
  }

  simulateJam(unitId: string): void {
    const unit = this.cashUnits.get(unitId);
    if (!unit) throw new Error(`Unknown cassette: ${unitId}`);
    unit.status = 'JAMMED';
    this.emitEvent(CDM_EVT.JAM, 'SRVE', { unitId, status: 'JAMMED' });
    this.logger.warn(`cassette jam injected: ${unitId}`);
  }

  clearJam(unitId: string): void {
    const unit = this.cashUnits.get(unitId);
    if (!unit) throw new Error(`Unknown cassette: ${unitId}`);
    unit.status = unit.count === 0 ? 'EMPTY' : unit.count <= unit.minimum ? 'LOW' : 'OK';
    this.logger.log(`cassette jam cleared: ${unitId} → ${unit.status}`);
  }

  getUnits(): CashUnit[] {
    return Array.from(this.cashUnits.values()).map((u) => ({ ...u }));
  }

  /** Override default cassette set — used by tests. */
  loadCassettes(units: CashUnit[]): void {
    this.cashUnits.clear();
    for (const u of units) this.cashUnits.set(u.unitId, { ...u });
  }

  private initializeCassettes(): void {
    const defaults: CashUnit[] = [
      {
        unitId: 'CASS1',
        denomination: 100_000,
        currency: 'IDR',
        status: 'OK',
        count: 500,
        initialCount: 500,
        maximum: 2500,
        minimum: 50,
        rejectCount: 0,
      },
      {
        unitId: 'CASS2',
        denomination: 50_000,
        currency: 'IDR',
        status: 'OK',
        count: 1000,
        initialCount: 1000,
        maximum: 2500,
        minimum: 100,
        rejectCount: 0,
      },
      {
        unitId: 'CASS3',
        denomination: 20_000,
        currency: 'IDR',
        status: 'OK',
        count: 500,
        initialCount: 500,
        maximum: 2500,
        minimum: 50,
        rejectCount: 0,
      },
      {
        unitId: 'REJECT',
        denomination: 0,
        currency: 'IDR',
        status: 'OK',
        count: 0,
        initialCount: 0,
        maximum: 300,
        minimum: 0,
        rejectCount: 0,
      },
    ];
    defaults.forEach((u) => this.cashUnits.set(u.unitId, { ...u }));
  }

  private dispense(payload: CdmDispensePayload): CdmDispenseResult {
    const { amount, mixType, customMix, present } = payload;

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(`invalid amount: ${amount}`);
    }

    const mix =
      mixType === 'CUSTOM' && customMix
        ? this.validateCustomMix(amount, customMix)
        : this.calculateMinNotesMix(amount);

    // Pre-flight: ensure every cassette has enough.
    for (const [denomStr, needed] of Object.entries(mix)) {
      const denom = Number(denomStr);
      const unit = this.findSpendableUnitByDenom(denom);
      if (!unit) throw new Error(`no active cassette for denomination ${denom}`);
      if (unit.count < needed) {
        throw new Error(
          `insufficient notes in ${unit.unitId} (need ${needed}, have ${unit.count})`,
        );
      }
    }

    // Deduct.
    for (const [denomStr, count] of Object.entries(mix)) {
      const denom = Number(denomStr);
      const unit = this.findSpendableUnitByDenom(denom)!;
      unit.count -= count;
      if (unit.count === 0) {
        unit.status = 'EMPTY';
      } else if (unit.count <= unit.minimum) {
        unit.status = 'LOW';
      }
      if (unit.status !== 'OK') {
        this.emitEvent(CDM_EVT.CASH_UNIT_THRESHOLD, 'SRVE', { unit: { ...unit } });
      }
    }

    this.presentedCash = { amount, notes: mix };

    if (present) {
      this.present();
    }

    return { mix, totalDispensed: amount };
  }

  private present(): CdmPresentResult {
    if (!this.presentedCash) throw new Error('no cash to present');
    const { amount } = this.presentedCash;
    this.emitEvent(CDM_EVT.NOTES_PRESENTED, 'EXEE', { amount });

    this.cancelTakeTimer();
    this.takeTimer = setTimeout(() => {
      if (this.presentedCash) {
        this.emitEvent(CDM_EVT.NOTES_TAKEN, 'SRVE', { amount: this.presentedCash.amount });
        this.presentedCash = null;
      }
      this.takeTimer = null;
    }, CdmDeviceService.TAKE_TIMEOUT_MS);

    return { amount };
  }

  private retract(): Record<string, never> {
    if (!this.presentedCash) throw new Error('nothing to retract');
    this.cancelTakeTimer();

    const reject = this.cashUnits.get('REJECT');
    if (reject) {
      const totalNotes = Object.values(this.presentedCash.notes).reduce((a, b) => a + b, 0);
      reject.count += totalNotes;
    }
    this.presentedCash = null;
    return {};
  }

  private getCashUnitInfo(): CashUnitInfoResult {
    const units = Array.from(this.cashUnits.values()).map((u) => ({ ...u }));
    const totalDispensed = units.reduce(
      (sum, u) => sum + Math.max(0, u.initialCount - u.count) * u.denomination,
      0,
    );
    return { units, totalDispensed, lastUpdated: new Date().toISOString() };
  }

  private count(): CdmCountResult {
    let totalAmount = 0;
    let totalNotes = 0;
    for (const u of this.cashUnits.values()) {
      if (u.unitId === 'REJECT') continue;
      totalAmount += u.count * u.denomination;
      totalNotes += u.count;
    }
    return { totalAmount, totalNotes };
  }

  private calculateMinNotesMix(amount: number): Record<string, number> {
    const spendable = Array.from(this.cashUnits.values())
      .filter(
        (u) =>
          u.unitId !== 'REJECT' &&
          u.status !== 'JAMMED' &&
          u.status !== 'INOPERATIVE' &&
          u.count > 0,
      )
      .sort((a, b) => b.denomination - a.denomination);

    const mix: Record<string, number> = {};
    let remaining = amount;

    for (const u of spendable) {
      const maxByCount = u.count;
      const maxByAmount = Math.floor(remaining / u.denomination);
      const take = Math.min(maxByCount, maxByAmount);
      if (take > 0) {
        mix[String(u.denomination)] = take;
        remaining -= take * u.denomination;
      }
      if (remaining === 0) break;
    }

    if (remaining > 0) {
      throw new Error(`cannot dispense exact amount; ${remaining} IDR remaining`);
    }

    return mix;
  }

  private validateCustomMix(amount: number, mix: Record<string, number>): Record<string, number> {
    let sum = 0;
    for (const [denomStr, count] of Object.entries(mix)) {
      const denom = Number(denomStr);
      if (!Number.isInteger(denom) || denom <= 0) throw new Error(`invalid denom: ${denomStr}`);
      if (!Number.isInteger(count) || count < 0) throw new Error(`invalid count for ${denomStr}`);
      sum += denom * count;
    }
    if (sum !== amount) {
      throw new Error(`custom mix sum ${sum} != requested amount ${amount}`);
    }
    return { ...mix };
  }

  private findSpendableUnitByDenom(denom: number): CashUnit | undefined {
    return Array.from(this.cashUnits.values()).find(
      (u) => u.denomination === denom && u.unitId !== 'REJECT' && u.status !== 'JAMMED',
    );
  }

  private cancelTakeTimer(): void {
    if (this.takeTimer) {
      clearTimeout(this.takeTimer);
      this.takeTimer = null;
    }
  }
}
