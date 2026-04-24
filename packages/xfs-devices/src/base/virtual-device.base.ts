import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  XfsEvent,
  XfsEventClass,
  XfsResult,
  XfsServiceClass,
  XfsServiceState,
} from '@atm/xfs-core';

/**
 * Base class for all virtual XFS devices.
 *
 * Responsibilities:
 *   - Track service state (open/closed/locked/busy/error).
 *   - Emit events via the shared EventEmitter2 bus.
 *   - Support deterministic response delays so tests can run fast but manual
 *     runs can show realistic device latency.
 *   - Support one-shot error injection for QA / operator console testing.
 *
 * Subclasses MUST implement `getCapabilities()` and `executeCommand()`.
 */
@Injectable()
export abstract class VirtualDeviceBase {
  protected readonly logger: Logger;
  protected state: XfsServiceState = XfsServiceState.CLOSED;
  protected injectedError: XfsResult | null = null;
  protected responseDelayMs = 200;

  constructor(
    public readonly serviceClass: XfsServiceClass,
    public readonly hService: string,
    protected readonly events: EventEmitter2,
  ) {
    this.logger = new Logger(`${serviceClass}:${hService}`);
  }

  abstract getCapabilities(): unknown;
  abstract executeCommand(commandCode: string, payload: unknown): Promise<unknown>;

  open(): void {
    this.state = XfsServiceState.OPEN;
    this.logger.log(`Service opened`);
  }

  close(): void {
    this.state = XfsServiceState.CLOSED;
    this.logger.log(`Service closed`);
  }

  reset(): void {
    this.state = XfsServiceState.OPEN;
    this.injectedError = null;
    this.logger.log(`Service reset`);
  }

  getState(): XfsServiceState {
    return this.state;
  }

  injectError(result: XfsResult): void {
    this.injectedError = result;
    this.logger.warn(`Error injected: ${XfsResult[result]}`);
  }

  clearError(): void {
    this.injectedError = null;
    this.logger.log('Injected error cleared');
  }

  setResponseDelay(ms: number): void {
    this.responseDelayMs = Math.max(0, Math.min(ms, 30_000));
    this.logger.debug(`Response delay set to ${this.responseDelayMs}ms`);
  }

  protected emitEvent<T>(eventCode: string, eventClass: XfsEventClass, payload: T): void {
    const event: XfsEvent<T> = {
      hService: this.hService,
      serviceClass: this.serviceClass,
      eventCode,
      eventClass,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.events.emit('xfs.event', event);
    this.logger.debug(`Event emitted: ${eventCode}`);
  }

  protected async simulateDelay(): Promise<void> {
    if (this.responseDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.responseDelayMs));
    }
  }

  /** One-shot: returns the injected error (and clears it) or null. */
  protected checkInjectedError(): XfsResult | null {
    if (this.injectedError !== null) {
      const err = this.injectedError;
      this.injectedError = null;
      return err;
    }
    return null;
  }
}
