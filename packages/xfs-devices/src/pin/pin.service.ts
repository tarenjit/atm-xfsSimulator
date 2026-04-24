import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'node:crypto';
import {
  PIN_CMD,
  PIN_EVT,
  PinBlockFormat,
  PinBlockResult,
  PinCapabilities,
  PinGetDataResult,
  PinGetPinPayload,
  PinGetPinResult,
  XfsServiceClass,
} from '@atm/xfs-core';
import { VirtualDeviceBase } from '../base/virtual-device.base';

interface EntrySpec {
  spec: PinGetPinPayload;
  resolveSuccess: (result: PinGetPinResult | PinGetDataResult) => void;
  reject: (err: Error) => void;
  mode: 'PIN' | 'DATA';
  timeoutHandle: NodeJS.Timeout;
}

/**
 * Virtual EPP (Encrypting PIN Pad).
 *
 * Two entry modes:
 *   - PIN: masked entry; resolves with { pinLength } — digits never leave
 *     the device except as an encrypted PIN block via GET_PINBLOCK.
 *   - DATA: plain entry for non-PIN numerics (amount, account); resolves
 *     with { data: "<digits>" }.
 *
 * ISO 9564 Format 0 PIN block + 3DES encryption. Not HSM-grade, but
 * deterministic enough for integration tests.
 */
@Injectable()
export class PinDeviceService extends VirtualDeviceBase {
  static readonly HSERVICE = 'PIN30';
  private static readonly DEFAULT_ENTRY_TIMEOUT_MS = 60_000;

  private pinBuffer = '';
  private active: EntrySpec | null = null;

  // Keys loaded into the virtual EPP. Double-length DES keys (16 bytes).
  private readonly keyStore = new Map<string, string>([
    ['TPK', '0123456789ABCDEF0123456789ABCDEF'],
    ['TMK', 'FEDCBA9876543210FEDCBA9876543210'],
  ]);

  constructor(events: EventEmitter2) {
    super(XfsServiceClass.PIN, PinDeviceService.HSERVICE, events);
    this.open();
  }

  getCapabilities(): PinCapabilities {
    return {
      serviceClass: XfsServiceClass.PIN,
      version: '3.30',
      type: 'EPP',
      pinBlockFormats: ['ISO0', 'ISO1', 'ISO3', 'ANSI'],
      keyFunctionModules: ['DES', '3DES'],
      supportedKeys: Array.from(this.keyStore.keys()),
    };
  }

  async executeCommand(commandCode: string, payload: unknown): Promise<unknown> {
    await this.simulateDelay();

    // RESET always runs — escape hatch from injected errors / stuck state.
    if (commandCode === PIN_CMD.RESET) {
      this.cancelEntry('device reset');
      this.pinBuffer = '';
      this.reset();
      return {};
    }

    const injected = this.checkInjectedError();
    if (injected !== null) {
      throw new Error(`XFS injected error: ${injected}`);
    }

    switch (commandCode) {
      case PIN_CMD.GET_PIN:
        return this.beginPinEntry(payload as PinGetPinPayload);
      case PIN_CMD.GET_DATA:
        return this.beginDataEntry(payload as PinGetPinPayload);
      case PIN_CMD.GET_PINBLOCK:
        return this.getPinBlock(
          payload as { keyName: string; format: PinBlockFormat; pan: string },
        );
      case PIN_CMD.GET_KEY_DETAIL:
        return { keys: Array.from(this.keyStore.keys()) };
      default:
        throw new Error(`Unsupported PIN command: ${commandCode}`);
    }
  }

  /**
   * Feed a keystroke into the buffered PIN/DATA entry.
   * Called from operator console / UI key events.
   */
  pressKey(key: string): void {
    if (!this.active) {
      this.logger.warn(`key pressed but no active entry: ${key}`);
      return;
    }
    this.emitEvent(PIN_EVT.KEY, 'EXEE', { keyPressed: key });

    const { spec } = this.active;

    if (key === 'CANCEL') {
      this.cancelEntry('user cancelled');
      return;
    }

    if (key === 'CLEAR') {
      this.pinBuffer = '';
      return;
    }

    if (key === 'ENTER' || spec.terminateKeys.includes(key)) {
      if (this.pinBuffer.length < spec.minLen) {
        this.logger.warn(`pin too short: ${this.pinBuffer.length} < minLen=${spec.minLen}`);
        return;
      }
      this.terminateEntry();
      return;
    }

    if (/^[0-9]$/.test(key) && this.pinBuffer.length < spec.maxLen) {
      this.pinBuffer += key;
      if (spec.autoEnd && this.pinBuffer.length === spec.maxLen) {
        this.terminateEntry();
      }
    }
  }

  /** Peek at buffered PIN length (never exposed to XFS clients). */
  getBufferedLength(): number {
    return this.pinBuffer.length;
  }

  /** Used by ATM app to verify entered PIN against a card's hash. */
  extractEnteredPin(): string {
    const out = this.pinBuffer;
    this.pinBuffer = '';
    return out;
  }

  private beginPinEntry(spec: PinGetPinPayload): Promise<PinGetPinResult> {
    this.cancelEntry('superseded');
    this.pinBuffer = '';

    return new Promise<PinGetPinResult>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.cancelEntry('pin entry timeout');
      }, PinDeviceService.DEFAULT_ENTRY_TIMEOUT_MS);

      this.active = {
        spec,
        mode: 'PIN',
        resolveSuccess: (r) => resolve(r as PinGetPinResult),
        reject,
        timeoutHandle,
      };
      this.emitEvent(PIN_EVT.ENTER_DATA, 'EXEE', {
        mode: 'PIN',
        minLen: spec.minLen,
        maxLen: spec.maxLen,
      });
    });
  }

  private beginDataEntry(spec: PinGetPinPayload): Promise<PinGetDataResult> {
    this.cancelEntry('superseded');
    this.pinBuffer = '';

    return new Promise<PinGetDataResult>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.cancelEntry('data entry timeout');
      }, PinDeviceService.DEFAULT_ENTRY_TIMEOUT_MS);

      this.active = {
        spec,
        mode: 'DATA',
        resolveSuccess: (r) => resolve(r as PinGetDataResult),
        reject,
        timeoutHandle,
      };
      this.emitEvent(PIN_EVT.ENTER_DATA, 'EXEE', {
        mode: 'DATA',
        minLen: spec.minLen,
        maxLen: spec.maxLen,
      });
    });
  }

  private terminateEntry(): void {
    if (!this.active) return;
    const { mode, resolveSuccess, timeoutHandle } = this.active;
    clearTimeout(timeoutHandle);
    this.active = null;
    this.emitEvent(PIN_EVT.DATA_READY, 'EXEE', { length: this.pinBuffer.length });
    if (mode === 'PIN') {
      resolveSuccess({ pinLength: this.pinBuffer.length });
      // Note: buffer retained so ATM app can verify; getPinBlock() clears it.
    } else {
      const data = this.pinBuffer;
      this.pinBuffer = '';
      resolveSuccess({ data });
    }
  }

  private cancelEntry(reason: string): void {
    if (!this.active) return;
    const { reject, timeoutHandle } = this.active;
    clearTimeout(timeoutHandle);
    this.active = null;
    this.pinBuffer = '';
    reject(new Error(reason));
  }

  private getPinBlock(params: {
    keyName: string;
    format: PinBlockFormat;
    pan: string;
  }): PinBlockResult {
    if (!this.pinBuffer) throw new Error('No PIN buffered');
    const key = this.keyStore.get(params.keyName);
    if (!key) throw new Error(`Key not found: ${params.keyName}`);

    const format: PinBlockFormat = params.format ?? 'ISO0';
    const pinBlockHex = this.buildIso0PinBlock(this.pinBuffer, params.pan);
    const encrypted = this.encrypt3DES(pinBlockHex, key);

    // Clear buffer after use — the block is the authoritative output.
    this.pinBuffer = '';

    return {
      pinBlock: encrypted,
      pinBlockFormat: format,
      keyName: params.keyName,
    };
  }

  private buildIso0PinBlock(pin: string, pan: string): string {
    const pinLen = pin.length;
    if (pinLen < 4 || pinLen > 12) throw new Error(`invalid pin length: ${pinLen}`);
    const pinField = `0${pinLen.toString(16).toUpperCase()}${pin}${'F'.repeat(16 - 2 - pinLen)}`;
    // PAN field: 12 rightmost PAN digits (excluding check digit) prefixed with 0000.
    const strip = pan.replace(/\D/g, '');
    const panDigits = strip.slice(-13, -1).padStart(12, '0');
    const panField = `0000${panDigits}`;
    return this.xorHex(pinField, panField);
  }

  private xorHex(a: string, b: string): string {
    if (a.length !== b.length) throw new Error('xor length mismatch');
    let out = '';
    for (let i = 0; i < a.length; i++) {
      const av = parseInt(a[i] ?? '0', 16);
      const bv = parseInt(b[i] ?? '0', 16);
      out += (av ^ bv).toString(16).toUpperCase();
    }
    return out;
  }

  private encrypt3DES(plaintextHex: string, keyHex: string): string {
    // ISO 9564 format 0 pin block is 8 bytes. Key: 16 bytes (double-length).
    // des-ede3 expects a 24-byte key; extend by repeating the first 8 bytes.
    const baseKey = Buffer.from(keyHex, 'hex');
    const extended = Buffer.concat([baseKey, baseKey.subarray(0, 8)]);
    const cipher = crypto.createCipheriv('des-ede3', extended, null);
    cipher.setAutoPadding(false);
    const data = Buffer.from(plaintextHex, 'hex');
    return Buffer.concat([cipher.update(data), cipher.final()])
      .toString('hex')
      .toUpperCase();
  }
}
