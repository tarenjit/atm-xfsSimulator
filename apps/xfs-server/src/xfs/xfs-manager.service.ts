import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  XfsCommand,
  XfsResponse,
  XfsResult,
  XfsServiceClass,
  xfsError,
  xfsSuccess,
} from '@atm/xfs-core';
import { VirtualDeviceBase } from '@atm/xfs-devices';
import { PrismaService } from '../prisma/prisma.service';

/**
 * XfsManagerService — central command router.
 *
 * - Holds the registry of active virtual device services keyed by hService.
 * - Dispatches commands to the right device and wraps results in the XFS
 *   response envelope.
 * - Logs every command to `XfsCommandLog` for audit + replay.
 *
 * Device registration is done via registerService(), called by device
 * providers on module init in Phase 2. Phase 1 ships an empty manager so the
 * server can boot.
 */
@Injectable()
export class XfsManagerService {
  private readonly logger = new Logger(XfsManagerService.name);
  private readonly services = new Map<string, VirtualDeviceBase>();

  constructor(
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  registerService(service: VirtualDeviceBase): void {
    if (this.services.has(service.hService)) {
      this.logger.warn(`Service ${service.hService} already registered — replacing`);
    }
    this.services.set(service.hService, service);
    this.logger.log(`Registered service ${service.serviceClass}:${service.hService}`);
  }

  listServices(): Array<{ hService: string; serviceClass: XfsServiceClass; state: string }> {
    return Array.from(this.services.values()).map((s) => ({
      hService: s.hService,
      serviceClass: s.serviceClass,
      state: s.getState(),
    }));
  }

  getService(hService: string): VirtualDeviceBase | undefined {
    return this.services.get(hService);
  }

  getInfo(hService: string): { capabilities: unknown; state: string } | null {
    const svc = this.services.get(hService);
    if (!svc) return null;
    return { capabilities: svc.getCapabilities(), state: svc.getState() };
  }

  async execute<T = unknown>(command: XfsCommand): Promise<XfsResponse<T>> {
    const startedAt = Date.now();
    const service = this.services.get(command.hService);

    if (!service) {
      const response = xfsError(
        command,
        XfsResult.ERR_SERVICE_NOT_FOUND,
        `Unknown hService: ${command.hService}`,
        Date.now() - startedAt,
      );
      await this.persistCommandLog(command, response);
      return response as XfsResponse<T>;
    }

    try {
      const payload = (await service.executeCommand(command.commandCode, command.payload)) as T;
      const response = xfsSuccess<T>(command, payload, Date.now() - startedAt);
      await this.persistCommandLog(command, response);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Command failed [${command.commandCode}] on ${command.hService}: ${message}`,
      );
      const response = xfsError(
        command,
        XfsResult.ERR_INTERNAL_ERROR,
        message,
        Date.now() - startedAt,
      );
      await this.persistCommandLog(command, response);
      return response as XfsResponse<T>;
    }
  }

  private async persistCommandLog(command: XfsCommand, response: XfsResponse): Promise<void> {
    try {
      await this.prisma.xfsCommandLog.create({
        data: {
          sessionId: command.sessionId ?? null,
          hService: command.hService,
          serviceClass: command.serviceClass,
          commandCode: command.commandCode,
          requestId: command.requestId,
          payload: (command.payload ?? {}) as object,
          response: (response.payload ?? {}) as object,
          result: response.result,
          errorDetail: response.errorDetail ?? null,
          durationMs: response.durationMs ?? null,
        },
      });
    } catch (err) {
      // Log failure must never break a command. Just warn.
      this.logger.warn(`Failed to persist command log: ${String(err)}`);
    }
  }
}
