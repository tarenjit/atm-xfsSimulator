import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PTR_CMD,
  PTR_EVT,
  PtrCapabilities,
  PtrPrintFormPayload,
  PtrPrintFormResult,
  PtrRawDataPayload,
  PtrRawDataResult,
  XfsServiceClass,
} from '@atm/xfs-core';
import { VirtualDeviceBase } from '../base/virtual-device.base';

export interface PrintedReceipt {
  receiptId: string;
  timestamp: string;
  content: string;
}

/**
 * Virtual thermal printer. Maintains an in-memory rolling buffer of printed
 * receipts (last 200) for replay / operator console preview.
 */
@Injectable()
export class PtrDeviceService extends VirtualDeviceBase {
  static readonly HSERVICE = 'PTR30';
  private static readonly MEDIA_TAKE_MS = 2_000;
  private static readonly HISTORY_LIMIT = 200;

  private paperLevel = 1_000;
  private readonly paperThreshold = 50;
  private readonly history: PrintedReceipt[] = [];

  constructor(events: EventEmitter2) {
    super(XfsServiceClass.PTR, PtrDeviceService.HSERVICE, events);
    this.open();
  }

  getCapabilities(): PtrCapabilities {
    return {
      serviceClass: XfsServiceClass.PTR,
      version: '3.30',
      type: 'THERMAL',
      canCut: true,
      paperCapacity: 1_000,
    };
  }

  async executeCommand(commandCode: string, payload: unknown): Promise<unknown> {
    await this.simulateDelay();

    // RESET always runs — it's the escape hatch from injected errors.
    if (commandCode === PTR_CMD.RESET) {
      this.reset();
      return {};
    }

    const injected = this.checkInjectedError();
    if (injected !== null) {
      throw new Error(`XFS injected error: ${injected}`);
    }

    switch (commandCode) {
      case PTR_CMD.PRINT_FORM:
        return this.printForm(payload as PtrPrintFormPayload);
      case PTR_CMD.RAW_DATA:
        return this.printRaw(payload as PtrRawDataPayload);
      case PTR_CMD.CUT_PAPER:
        return {};
      default:
        throw new Error(`Unsupported PTR command: ${commandCode}`);
    }
  }

  replenishPaper(): void {
    this.paperLevel = 1_000;
    this.logger.log('paper replenished to 1000');
  }

  getHistory(): PrintedReceipt[] {
    return [...this.history];
  }

  getPaperLevel(): number {
    return this.paperLevel;
  }

  private printForm(payload: PtrPrintFormPayload): PtrPrintFormResult {
    if (this.paperLevel <= 0) throw new Error('out of paper');

    const content = this.renderForm(payload);
    const receiptId = `RCPT${Date.now().toString(36).toUpperCase()}`;
    this.record({ receiptId, timestamp: new Date().toISOString(), content });
    this.paperLevel -= 1;

    if (this.paperLevel <= this.paperThreshold) {
      this.emitEvent(PTR_EVT.PAPER_THRESHOLD, 'SRVE', { level: this.paperLevel });
    }

    this.emitEvent(PTR_EVT.MEDIA_PRESENTED, 'SRVE', { receiptId, content });
    setTimeout(
      () => this.emitEvent(PTR_EVT.MEDIA_TAKEN, 'SRVE', { receiptId }),
      PtrDeviceService.MEDIA_TAKE_MS,
    );

    return { receiptId };
  }

  private printRaw(payload: PtrRawDataPayload): PtrRawDataResult {
    if (this.paperLevel <= 0) throw new Error('out of paper');
    const receiptId = `RAW${Date.now().toString(36).toUpperCase()}`;
    this.record({ receiptId, timestamp: new Date().toISOString(), content: payload.data });
    this.paperLevel -= 1;
    return { printed: true };
  }

  private record(r: PrintedReceipt): void {
    this.history.push(r);
    if (this.history.length > PtrDeviceService.HISTORY_LIMIT) {
      this.history.shift();
    }
  }

  private renderForm(payload: PtrPrintFormPayload): string {
    const { formName, fields } = payload;
    const now = new Date().toLocaleString('id-ID');

    if (formName === 'RECEIPT') {
      return [
        '====================================',
        `    ${fields.bankName ?? 'ZEGEN BANK'}`,
        '====================================',
        now,
        `ATM:   ${fields.atmId ?? 'ATM001'}`,
        `Trace: ${fields.traceNo ?? '000000'}`,
        '',
        `Transaction: ${fields.txnType ?? 'WITHDRAWAL'}`,
        `Card:        ****${fields.cardLast4 ?? '0000'}`,
        `Account:     ${fields.account ?? '-'}`,
        '',
        `Amount:      Rp ${fields.amount ?? '0'}`,
        `Fee:         Rp ${fields.fee ?? '0'}`,
        '------------------------------------',
        `Total:       Rp ${fields.total ?? '0'}`,
        '',
        `Balance:     Rp ${fields.balance ?? '***'}`,
        '',
        'Thank you for banking with us.',
        '====================================',
      ].join('\n');
    }

    if (formName === 'STATEMENT' || formName === 'JOURNAL') {
      return JSON.stringify({ form: formName, at: now, fields }, null, 2);
    }

    return JSON.stringify(fields, null, 2);
  }
}
