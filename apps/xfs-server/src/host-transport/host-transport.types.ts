/**
 * Host transport contracts (Phase 7.1).
 *
 * The simulator's host emulator is invoked through one of three transports:
 *
 *   1. IN_PROCESS      — direct method calls from the ATM state machine
 *                        (the default that has shipped since Phase 3).
 *   2. ISO8583_TCP     — opens a TCP listener and decodes ISO 8583:1987
 *                        messages off the wire. Real Indonesian middleware
 *                        (Euronet MVS, NCR APTRA, Hyosung MoniPlus) speaks
 *                        this. Same business logic as in-process; only the
 *                        transport layer differs.
 *   3. ISO20022_HTTP   — accepts BI-FAST-style XML pacs.008 messages over
 *                        HTTP. ISO 20022 / pacs.* family. Newer real-time
 *                        payment hosts use this.
 *
 * The operator console flips between transports at runtime via the
 * HostTransportManagerService — they all dispatch into the same
 * HostEmulatorService underneath.
 */

import type { IsoSwitchId } from '@atm/iso8583';

export type HostTransportKind = 'IN_PROCESS' | 'ISO8583_TCP' | 'ISO20022_HTTP';

export interface HostTransportRuntimeStatus {
  kind: HostTransportKind;
  configId: string;
  listening: boolean;
  bindAddress: string;
  port: number;
  switchProfile: IsoSwitchId;
  activeConnections: number;
  totalRequests: number;
  startedAt: string | null;
  lastError: string | null;
}

export interface IHostTransport {
  readonly kind: HostTransportKind;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): HostTransportRuntimeStatus;
}

export class HostTransportError extends Error {
  constructor(
    message: string,
    public readonly kind: HostTransportKind,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'HostTransportError';
  }
}
