/**
 * Core XFS types, mirroring the CEN/XFS 3.30 subset used by modern ATMs.
 * These are pure data contracts — no runtime deps, no framework coupling.
 */

/** WOSA/XFS result codes. Negative = error. */
export enum XfsResult {
  SUCCESS = 0,
  ERR_CANCEL = -1,
  ERR_DEV_NOT_READY = -2,
  ERR_HARDWARE_ERROR = -3,
  ERR_INVALID_HSERVICE = -4,
  ERR_INTERNAL_ERROR = -5,
  ERR_TIMEOUT = -6,
  ERR_USER_ERROR = -7,
  ERR_UNSUPP_COMMAND = -8,
  ERR_SERVICE_NOT_FOUND = -9,
  ERR_LOCKED = -10,
  ERR_NOT_STARTED = -11,
}

/** Device service classes. */
export enum XfsServiceClass {
  IDC = 'IDC', // Identification Card (card reader)
  PIN = 'PIN', // PIN Pad / Encrypting PIN Pad
  CDM = 'CDM', // Cash Dispenser Module
  PTR = 'PTR', // Printer (receipt + journal)
  SIU = 'SIU', // Sensors & Indicators
  TTU = 'TTU', // Text Terminal Unit
}

/** Device lifecycle state. */
export enum XfsServiceState {
  CLOSED = 'closed',
  OPEN = 'open',
  LOCKED = 'locked',
  BUSY = 'busy',
  ERROR = 'error',
}

/** XFS event class per spec. */
export type XfsEventClass = 'SRVE' | 'USRE' | 'EXEE' | 'SYSE';

/** Base command envelope. */
export interface XfsCommand<T = unknown> {
  hService: string;
  serviceClass: XfsServiceClass;
  commandCode: string;
  requestId: string;
  timeoutMs: number;
  payload: T;
  timestamp: string;
  sessionId?: string;
}

/** Base response envelope. */
export interface XfsResponse<T = unknown> {
  requestId: string;
  hService: string;
  result: XfsResult;
  payload: T | null;
  errorDetail?: string;
  timestamp: string;
  durationMs?: number;
}

/** Async event pushed from device to client. */
export interface XfsEvent<T = unknown> {
  hService: string;
  serviceClass: XfsServiceClass;
  eventCode: string;
  eventClass: XfsEventClass;
  payload: T;
  timestamp: string;
}

/** Common capability header — each device extends this. */
export interface XfsCapabilitiesBase {
  serviceClass: XfsServiceClass;
  version: string;
}

/** Convenience type: success envelope. */
export function xfsSuccess<T>(
  command: XfsCommand,
  payload: T,
  durationMs?: number,
): XfsResponse<T> {
  return {
    requestId: command.requestId,
    hService: command.hService,
    result: XfsResult.SUCCESS,
    payload,
    timestamp: new Date().toISOString(),
    durationMs,
  };
}

/** Convenience type: error envelope. */
export function xfsError(
  command: XfsCommand,
  result: XfsResult,
  errorDetail: string,
  durationMs?: number,
): XfsResponse<null> {
  return {
    requestId: command.requestId,
    hService: command.hService,
    result,
    payload: null,
    errorDetail,
    timestamp: new Date().toISOString(),
    durationMs,
  };
}
