import { Logger } from '@nestjs/common';
import * as net from 'node:net';
import type { IsoSwitchId } from '@atm/iso8583';
import { IsoMti, getSwitchById } from '@atm/iso8583';
import type { HostEmulatorService } from '../host/host-emulator.service';
import {
  HostTransportError,
  type HostTransportRuntimeStatus,
  type IHostTransport,
} from './host-transport.types';

/**
 * ISO 8583:1987 TCP transport.
 *
 * Frames: 2-byte big-endian length prefix + ASCII body. Supports the
 * minimum field subset our HostEmulator cares about:
 *   MTI 0100 → authentication (PAN check)
 *   MTI 0200 → financial request (withdrawal)
 *   MTI 0400 → reversal
 *   MTI 0800 → network management (echo / heartbeat)
 *
 * This is a deliberately thin codec — Phase 9+ contract tests will exercise
 * the full bitmap codec from packages/iso8583. For Phase 7.1 we only need
 * enough to prove a real ATM application can connect, send a 0200, and get
 * a sensible 0210 back.
 */
export class Iso8583TcpTransport implements IHostTransport {
  readonly kind = 'ISO8583_TCP' as const;
  private readonly logger = new Logger('HostTransport:ISO8583_TCP');
  private server: net.Server | null = null;
  private startedAt: string | null = null;
  private activeConnections = 0;
  private totalRequests = 0;
  private lastError: string | null = null;

  constructor(
    public readonly configId: string,
    private readonly bindAddress: string,
    private readonly port: number,
    private readonly switchProfile: IsoSwitchId,
    private readonly host: HostEmulatorService,
  ) {}

  async start(): Promise<void> {
    if (this.server) return;
    const profile = getSwitchById(this.switchProfile);

    this.server = net.createServer((socket) => this.handleSocket(socket));
    this.server.on('error', (err) => {
      this.lastError = err.message;
      this.logger.error(`server error: ${err.message}`);
    });

    return new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        this.server = null;
        reject(new HostTransportError(`failed to bind ${this.bindAddress}:${this.port}: ${err.message}`, this.kind, err));
      };
      this.server!.once('error', onError);
      this.server!.listen(this.port, this.bindAddress, () => {
        this.server!.removeListener('error', onError);
        this.startedAt = new Date().toISOString();
        this.logger.log(
          `listening on ${this.bindAddress}:${this.port} (switch=${profile.name}, MTI=${profile.mtiVariant})`,
        );
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server!.close(() => {
        this.startedAt = null;
        this.server = null;
        this.activeConnections = 0;
        this.logger.log('stopped');
        resolve();
      });
    });
  }

  status(): HostTransportRuntimeStatus {
    return {
      kind: this.kind,
      configId: this.configId,
      listening: this.server !== null && this.startedAt !== null,
      bindAddress: this.bindAddress,
      port: this.port,
      switchProfile: this.switchProfile,
      activeConnections: this.activeConnections,
      totalRequests: this.totalRequests,
      startedAt: this.startedAt,
      lastError: this.lastError,
    };
  }

  // ---- Socket handling --------------------------------------------------

  private handleSocket(socket: net.Socket): void {
    this.activeConnections++;
    const peer = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.log(`peer connected ${peer}`);

    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 2) {
        const len = buf.readUInt16BE(0);
        if (buf.length < 2 + len) break;
        const body = buf.subarray(2, 2 + len).toString('ascii');
        buf = buf.subarray(2 + len);
        this.totalRequests++;
        this.handleMessage(socket, body).catch((err) => {
          this.logger.error(`handler failed: ${(err as Error).message}`);
        });
      }
    });

    socket.on('close', () => {
      this.activeConnections--;
      this.logger.log(`peer disconnected ${peer}`);
    });
    socket.on('error', (err) => {
      this.logger.warn(`socket error ${peer}: ${err.message}`);
    });
  }

  private async handleMessage(socket: net.Socket, body: string): Promise<void> {
    // Minimal "text-on-the-wire" framing for Phase 7.1: the first 4 chars are
    // the MTI, then KEY=VALUE pairs separated by '|'. This is not full ISO
    // 8583 bitmap encoding (Phase 9+ contract tests cover that via
    // packages/iso8583's encoder/decoder). It IS enough to demonstrate the
    // transport-toggle works end-to-end + matches the wire-protocol contract
    // a real middleware test harness needs.
    const mti = body.slice(0, 4);
    const fields = parseSimpleFields(body.slice(4));
    let response: string;
    try {
      response = await this.dispatch(mti, fields);
    } catch (err) {
      response = `${IsoMti.NETWORK_MGMT_RESPONSE}|39=96|reason=${(err as Error).message}`;
    }
    const resBody = Buffer.from(response, 'ascii');
    const header = Buffer.alloc(2);
    header.writeUInt16BE(resBody.length);
    socket.write(Buffer.concat([header, resBody]));
  }

  private async dispatch(
    mti: string,
    fields: Record<string, string>,
  ): Promise<string> {
    const profile = getSwitchById(this.switchProfile);
    const pan = fields['2'] ?? fields['pan'] ?? '';
    const amount = Number(fields['4'] ?? fields['amount'] ?? '0');
    const sessionId = fields['session'] ?? `tcp-${Date.now()}`;

    switch (mti) {
      case IsoMti.AUTH_REQUEST: {
        const r = await this.host.authenticate(pan);
        return `0110|39=${r.responseCode}|switch=${profile.id}`;
      }
      case IsoMti.FINANCIAL_REQUEST: {
        const r = await this.host.authorizeWithdrawal({
          pan,
          amount,
          sessionId,
          switchProfile: profile,
        });
        return `0210|39=${r.responseCode}|stan=${r.stanNo}|auth=${r.authCode ?? ''}|switch=${profile.id}`;
      }
      case IsoMti.REVERSAL: {
        // Reversals need the original transaction context; the simulator
        // just acknowledges receipt for the smoke flow.
        return `0410|39=00|switch=${profile.id}`;
      }
      case IsoMti.NETWORK_MGMT: {
        return `0810|39=00|switch=${profile.id}|alive=true`;
      }
      default:
        return `0810|39=12|reason=unsupported MTI ${mti}`;
    }
  }
}

function parseSimpleFields(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  for (const pair of s.split('|')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    out[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return out;
}
