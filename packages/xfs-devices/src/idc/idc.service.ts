import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IDC_CMD,
  IDC_EVT,
  IdcCapabilities,
  IdcChipIoPayload,
  IdcChipIoResult,
  IdcReadTrackResult,
  XfsServiceClass,
} from '@atm/xfs-core';
import { VirtualDeviceBase } from '../base/virtual-device.base';

/**
 * Virtual card used by the IDC service. The `pin` field here is a hashed PIN
 * (via @atm/shared hashPin) — the device never returns it, it only exposes
 * it to the ATM app for verifyPin() comparison.
 */
export interface VirtualCard {
  pan: string;
  cardholderName: string;
  expiryDate: string;
  track1: string;
  track2: string;
  pinHash: string;
  chipData?: string;
  issuer: string;
}

/**
 * IDC (card reader) virtual device.
 *
 * State machine:
 *   IDLE → CARD_IN (after insertCard)
 *        → CARD_IN → IDLE (on eject)
 *        → CARD_IN → RETAINED (on retain)
 *
 * Inserting while a card is already in reader is rejected to match real
 * motor card readers.
 */
@Injectable()
export class IdcDeviceService extends VirtualDeviceBase {
  static readonly HSERVICE = 'IDC30';

  private currentCard: VirtualCard | null = null;
  private cardHeld = false;

  constructor(events: EventEmitter2) {
    super(XfsServiceClass.IDC, IdcDeviceService.HSERVICE, events);
    this.open();
  }

  getCapabilities(): IdcCapabilities {
    return {
      serviceClass: XfsServiceClass.IDC,
      version: '3.30',
      type: 'MOTOR',
      readTracks: [1, 2],
      writeTracks: [],
      chipProtocols: ['T0', 'T1', 'EMV'],
      canEject: true,
      canRetain: true,
    };
  }

  /**
   * Simulate physical card insertion. Called by the operator console or the
   * REST /sessions/insert-card endpoint. Idempotent rejection on double-insert.
   */
  insertCard(card: VirtualCard): { inserted: boolean; reason?: string } {
    if (this.cardHeld) {
      this.logger.warn('insertCard rejected: card already in reader');
      return { inserted: false, reason: 'card already in reader' };
    }
    this.currentCard = card;
    this.cardHeld = true;
    this.emitEvent(IDC_EVT.MEDIA_INSERTED, 'SRVE', { pan: card.pan });
    return { inserted: true };
  }

  hasCard(): boolean {
    return this.cardHeld;
  }

  /** Intended for the ATM app only — NEVER exposed over XFS. */
  getCurrentPinHash(): string | null {
    return this.currentCard?.pinHash ?? null;
  }

  /** Intended for the ATM app only — NEVER exposed over XFS. */
  getCurrentCard(): VirtualCard | null {
    return this.currentCard;
  }

  async executeCommand(commandCode: string, payload: unknown): Promise<unknown> {
    await this.simulateDelay();

    // RESET always runs — escape hatch from injected errors / stuck state.
    if (commandCode === IDC_CMD.RESET) {
      this.reset();
      this.currentCard = null;
      this.cardHeld = false;
      return {};
    }

    const injected = this.checkInjectedError();
    if (injected !== null) {
      throw new Error(`XFS injected error: ${injected}`);
    }

    switch (commandCode) {
      case IDC_CMD.READ_TRACK:
        return this.readTrack();
      case IDC_CMD.READ_RAW_DATA:
        return this.readRawData();
      case IDC_CMD.EJECT_CARD:
        return this.ejectCard();
      case IDC_CMD.RETAIN_CARD:
        return this.retainCard();
      case IDC_CMD.CHIP_IO:
      case IDC_CMD.CHIP_POWER:
        return this.chipOperation(commandCode, payload as IdcChipIoPayload);
      default:
        throw new Error(`Unsupported IDC command: ${commandCode}`);
    }
  }

  private readTrack(): IdcReadTrackResult {
    if (!this.currentCard) throw new Error('No card in reader');
    return {
      track1: this.currentCard.track1,
      track2: this.currentCard.track2,
      pan: this.currentCard.pan,
      cardholderName: this.currentCard.cardholderName,
      expiryDate: this.currentCard.expiryDate,
      chipData: this.currentCard.chipData,
    };
  }

  private readRawData(): { track1Raw: string; track2Raw: string } {
    if (!this.currentCard) throw new Error('No card in reader');
    return {
      track1Raw: Buffer.from(this.currentCard.track1).toString('base64'),
      track2Raw: Buffer.from(this.currentCard.track2).toString('base64'),
    };
  }

  private ejectCard(): Record<string, never> {
    if (!this.cardHeld) throw new Error('No card to eject');
    const pan = this.currentCard?.pan;
    this.currentCard = null;
    this.cardHeld = false;
    this.emitEvent(IDC_EVT.MEDIA_REMOVED, 'SRVE', { pan });
    return {};
  }

  private retainCard(): Record<string, never> {
    if (!this.cardHeld) throw new Error('No card to retain');
    const pan = this.currentCard?.pan;
    this.currentCard = null;
    this.cardHeld = false;
    this.emitEvent(IDC_EVT.MEDIA_RETAINED, 'SRVE', { pan });
    return {};
  }

  private chipOperation(_commandCode: string, _payload: IdcChipIoPayload): IdcChipIoResult {
    // Stub: Phase 6 can expand EMV APDU handling. 9000 = OK.
    return { apdu: '9000', status: 'success' };
  }
}
