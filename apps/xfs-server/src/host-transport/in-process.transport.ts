import { Logger } from '@nestjs/common';
import type { IsoSwitchId } from '@atm/iso8583';
import type {
  HostTransportRuntimeStatus,
  IHostTransport,
} from './host-transport.types';

/**
 * In-process transport — no network. Records the active config so the
 * operator console can show "current default = in-process". The actual
 * dispatch into HostEmulatorService still happens via direct method calls
 * from the ATM state machine; this class is the no-op listener.
 */
export class InProcessTransport implements IHostTransport {
  readonly kind = 'IN_PROCESS' as const;
  private readonly logger = new Logger('HostTransport:InProcess');
  private startedAt: string | null = null;

  constructor(
    public readonly configId: string,
    public readonly switchProfile: IsoSwitchId,
  ) {}

  async start(): Promise<void> {
    this.startedAt = new Date().toISOString();
    this.logger.log(`active (switch=${this.switchProfile}) — direct method dispatch`);
  }

  async stop(): Promise<void> {
    this.startedAt = null;
    this.logger.log('stopped');
  }

  status(): HostTransportRuntimeStatus {
    return {
      kind: this.kind,
      configId: this.configId,
      listening: this.startedAt !== null,
      bindAddress: '127.0.0.1',
      port: 0,
      switchProfile: this.switchProfile,
      activeConnections: 0,
      totalRequests: 0,
      startedAt: this.startedAt,
      lastError: null,
    };
  }
}
