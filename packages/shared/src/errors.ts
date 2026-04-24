/**
 * Domain-level error taxonomy for the simulator. These sit above raw XFS
 * result codes and are what the application layer throws.
 */
export enum AtmErrorCode {
  UNKNOWN = 'UNKNOWN',
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  DEVICE_ERROR = 'DEVICE_ERROR',
  DEVICE_BUSY = 'DEVICE_BUSY',
  DEVICE_NOT_READY = 'DEVICE_NOT_READY',
  TIMEOUT = 'TIMEOUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  HOST_DECLINED = 'HOST_DECLINED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  DAILY_LIMIT_EXCEEDED = 'DAILY_LIMIT_EXCEEDED',
  CASSETTE_EMPTY = 'CASSETTE_EMPTY',
  CASSETTE_JAMMED = 'CASSETTE_JAMMED',
  PIN_INVALID = 'PIN_INVALID',
  PIN_TIMEOUT = 'PIN_TIMEOUT',
  CARD_RETAINED = 'CARD_RETAINED',
  CARD_BLOCKED = 'CARD_BLOCKED',
  CARD_EXPIRED = 'CARD_EXPIRED',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_INVALID_STATE = 'SESSION_INVALID_STATE',
}

export class AtmError extends Error {
  public readonly code: AtmErrorCode;
  public readonly detail?: unknown;
  public readonly cause?: unknown;

  constructor(code: AtmErrorCode, message: string, opts?: { detail?: unknown; cause?: unknown }) {
    super(message);
    this.name = 'AtmError';
    this.code = code;
    this.detail = opts?.detail;
    this.cause = opts?.cause;
  }

  toJSON(): { code: AtmErrorCode; message: string; detail?: unknown } {
    return { code: this.code, message: this.message, detail: this.detail };
  }
}

export function isAtmError(e: unknown): e is AtmError {
  return e instanceof AtmError;
}
