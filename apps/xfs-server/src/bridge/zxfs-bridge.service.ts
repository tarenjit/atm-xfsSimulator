import * as net from 'node:net';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { XfsEvent, XfsServiceClass } from '@atm/xfs-core';
import { XfsManagerService } from '../xfs/xfs-manager.service';

/**
 * ZXFS TCP bridge — Phase 8c skeleton.
 *
 * Accepts length-prefixed JSON frames from the Windows DLL (ZegenXFS.dll)
 * and translates them into XfsManagerService calls. Broadcasts XFS events
 * back to all connected DLL clients.
 *
 * Protocol: see packages/xfs-dll/ZXFS_PROTOCOL.md.
 *
 * Enable by setting ZXFS_BRIDGE_ENABLED=true. Defaults to disabled so
 * local dev and CI don't open a rogue TCP port.
 */
@Injectable()
export class ZxfsBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZxfsBridgeService.name);
  private server: net.Server | null = null;
  private readonly clients = new Set<net.Socket>();

  constructor(private readonly manager: XfsManagerService) {}

  onModuleInit(): void {
    if (process.env.ZXFS_BRIDGE_ENABLED !== 'true') {
      this.logger.log('ZXFS bridge disabled (set ZXFS_BRIDGE_ENABLED=true to enable)');
      return;
    }
    const host = process.env.ZXFS_BRIDGE_HOST ?? '0.0.0.0';
    const port = Number(process.env.ZXFS_BRIDGE_PORT ?? 9101);

    this.server = net.createServer((socket) => this.handleClient(socket));
    this.server.on('error', (err) => this.logger.error(`bridge error: ${err.message}`));
    this.server.listen(port, host, () => {
      this.logger.log(`ZXFS bridge listening on ${host}:${port}`);
    });
  }

  onModuleDestroy(): void {
    for (const sock of this.clients) sock.destroy();
    this.clients.clear();
    this.server?.close();
    this.server = null;
  }

  /**
   * Broadcast XFS events to every connected DLL client, as `event` frames.
   */
  @OnEvent('xfs.event')
  onXfsEvent(event: XfsEvent): void {
    if (this.clients.size === 0) return;
    const frame = {
      type: 'event',
      id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      service: event.serviceClass,
      hService: event.hService,
      eventCode: event.eventCode,
      eventClass: event.eventClass,
      payload: event.payload,
    };
    for (const sock of this.clients) this.sendFrame(sock, frame);
  }

  private handleClient(socket: net.Socket): void {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.log(`bridge connect: ${remote}`);
    this.clients.add(socket);

    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      // Extract all complete frames from the buffer.
      while (buffer.length >= 4) {
        const len = buffer.readUInt32LE(0);
        if (len > 1_000_000) {
          this.logger.error(`bridge ${remote}: oversized frame (${len} bytes), closing`);
          socket.destroy();
          return;
        }
        if (buffer.length < 4 + len) break;
        const body = buffer.subarray(4, 4 + len).toString('utf8');
        buffer = buffer.subarray(4 + len);
        void this.handleFrame(socket, body);
      }
    });

    socket.on('close', () => {
      this.logger.log(`bridge disconnect: ${remote}`);
      this.clients.delete(socket);
    });
    socket.on('error', (err) => {
      this.logger.warn(`bridge ${remote} error: ${err.message}`);
    });
  }

  private async handleFrame(socket: net.Socket, body: string): Promise<void> {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(body) as Record<string, unknown>;
    } catch (e) {
      this.logger.warn(`bridge bad JSON: ${String(e)}`);
      return;
    }
    const type = frame.type as string;

    if (type === 'ping') {
      this.sendFrame(socket, { type: 'pong', id: frame.id, ts: new Date().toISOString() });
      return;
    }

    if (type !== 'request') {
      this.logger.warn(`bridge ignoring unknown frame type: ${type}`);
      return;
    }

    const op = frame.op as string;
    const id = frame.id as string;
    const service = frame.service as XfsServiceClass;

    try {
      if (op === 'WFPOpen') {
        // Discovery: which hService(s) serve the requested service class?
        const services = this.manager.listServices().filter((s) => s.serviceClass === service);
        if (services.length === 0) {
          this.sendFrame(socket, {
            type: 'response',
            id,
            ts: new Date().toISOString(),
            result: -9, // ERR_SERVICE_NOT_FOUND
            payload: null,
            errorDetail: `no service of class ${service}`,
          });
          return;
        }
        this.sendFrame(socket, {
          type: 'response',
          id,
          ts: new Date().toISOString(),
          result: 0,
          payload: { hService: services[0].hService },
        });
        return;
      }

      if (op === 'WFPGetInfo') {
        const info = this.manager.getInfo(frame.hService as string);
        if (!info) {
          this.sendFrame(socket, {
            type: 'response',
            id,
            ts: new Date().toISOString(),
            result: -4, // ERR_INVALID_HSERVICE
            payload: null,
            errorDetail: 'unknown hService',
          });
          return;
        }
        this.sendFrame(socket, {
          type: 'response',
          id,
          ts: new Date().toISOString(),
          result: 0,
          payload: info,
        });
        return;
      }

      if (op === 'WFPExecute') {
        const command = {
          hService: frame.hService as string,
          serviceClass: service,
          commandCode: frame.commandCode as string,
          requestId: id,
          timeoutMs: 30_000,
          payload: frame.payload as unknown,
          timestamp: new Date().toISOString(),
        };
        const response = await this.manager.execute(command);
        this.sendFrame(socket, {
          type: 'response',
          id,
          ts: new Date().toISOString(),
          result: response.result,
          payload: response.payload,
          errorDetail: response.errorDetail,
        });
        return;
      }

      if (op === 'WFPClose') {
        // No-op: our services are long-lived singletons. Real XFS would
        // decrement a refcount here.
        this.sendFrame(socket, {
          type: 'response',
          id,
          ts: new Date().toISOString(),
          result: 0,
          payload: { closed: true },
        });
        return;
      }

      this.sendFrame(socket, {
        type: 'response',
        id,
        ts: new Date().toISOString(),
        result: -8, // ERR_UNSUPP_COMMAND
        payload: null,
        errorDetail: `unknown op: ${op}`,
      });
    } catch (err) {
      this.sendFrame(socket, {
        type: 'response',
        id,
        ts: new Date().toISOString(),
        result: -5, // ERR_INTERNAL_ERROR
        payload: null,
        errorDetail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private sendFrame(socket: net.Socket, frame: unknown): void {
    const body = Buffer.from(JSON.stringify(frame), 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    socket.write(Buffer.concat([header, body]));
  }
}
