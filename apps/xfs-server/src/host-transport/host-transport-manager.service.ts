import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { IsoSwitchId } from '@atm/iso8583';
import { ALL_SWITCH_PROFILES } from '@atm/iso8583';
import { PrismaService } from '../prisma/prisma.service';
import { HostEmulatorService } from '../host/host-emulator.service';
import { InProcessTransport } from './in-process.transport';
import { Iso8583TcpTransport } from './iso8583-tcp.transport';
import { Iso20022HttpTransport } from './iso20022-http.transport';
import {
  type HostTransportKind,
  type HostTransportRuntimeStatus,
  type IHostTransport,
} from './host-transport.types';

const VALID_KINDS: readonly HostTransportKind[] = [
  'IN_PROCESS',
  'ISO8583_TCP',
  'ISO20022_HTTP',
];

const VALID_SWITCHES: readonly IsoSwitchId[] = ALL_SWITCH_PROFILES.map((p) => p.id);

export interface HostTransportConfigDto {
  id: string;
  name: string;
  kind: HostTransportKind;
  bindAddress: string;
  port: number;
  switchProfile: IsoSwitchId;
  tlsEnabled: boolean;
  enabled: boolean;
  isPrimary: boolean;
  notes: string | null;
  status: HostTransportRuntimeStatus;
}

export interface CreateOrUpdateHostTransportInput {
  name?: string;
  kind?: HostTransportKind;
  bindAddress?: string;
  port?: number;
  switchProfile?: IsoSwitchId;
  tlsEnabled?: boolean;
  isPrimary?: boolean;
  notes?: string;
}

/**
 * Manages the lifecycle of HostTransport listeners. On boot, hydrates from
 * Prisma + auto-starts every config marked `enabled`. Operator console drives
 * create / update / start / stop via HostTransportController.
 */
@Injectable()
export class HostTransportManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HostTransportManagerService.name);
  private readonly running = new Map<string, IHostTransport>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly host: HostEmulatorService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSeedRows();
    const configs = await this.prisma.hostTransportConfig.findMany({
      where: { enabled: true },
    });
    for (const cfg of configs) {
      try {
        await this.startConfig(cfg.id);
      } catch (err) {
        this.logger.error(`failed to auto-start ${cfg.name}: ${(err as Error).message}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const t of this.running.values()) {
      try {
        await t.stop();
      } catch {
        // best-effort shutdown
      }
    }
    this.running.clear();
  }

  // ---- Public API used by controller ---------------------------------------

  async list(): Promise<HostTransportConfigDto[]> {
    const rows = await this.prisma.hostTransportConfig.findMany({
      orderBy: [{ isPrimary: 'desc' }, { kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async get(id: string): Promise<HostTransportConfigDto> {
    const row = await this.prisma.hostTransportConfig.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`HostTransportConfig ${id} not found`);
    return this.toDto(row);
  }

  async create(input: CreateOrUpdateHostTransportInput): Promise<HostTransportConfigDto> {
    const kind = this.requireKind(input.kind);
    const switchProfile = this.requireSwitch(input.switchProfile ?? 'JALIN');
    const port = this.normalizePort(kind, input.port);
    const row = await this.prisma.hostTransportConfig.create({
      data: {
        name: input.name ?? `${kind} ${port}`,
        kind,
        bindAddress: input.bindAddress ?? '127.0.0.1',
        port,
        switchProfile,
        tlsEnabled: input.tlsEnabled ?? false,
        isPrimary: input.isPrimary ?? false,
        enabled: false,
        notes: input.notes ?? null,
      },
    });
    return this.toDto(row);
  }

  async update(id: string, input: CreateOrUpdateHostTransportInput): Promise<HostTransportConfigDto> {
    const existing = await this.prisma.hostTransportConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`HostTransportConfig ${id} not found`);
    if (existing.enabled) {
      throw new BadRequestException('Stop the listener before editing its config');
    }

    const kind = input.kind ? this.requireKind(input.kind) : (existing.kind as HostTransportKind);
    const switchProfile = input.switchProfile
      ? this.requireSwitch(input.switchProfile)
      : (existing.switchProfile as IsoSwitchId);
    const port = input.port !== undefined ? this.normalizePort(kind, input.port) : existing.port;

    const row = await this.prisma.hostTransportConfig.update({
      where: { id },
      data: {
        name: input.name ?? existing.name,
        kind,
        bindAddress: input.bindAddress ?? existing.bindAddress,
        port,
        switchProfile,
        tlsEnabled: input.tlsEnabled ?? existing.tlsEnabled,
        isPrimary: input.isPrimary ?? existing.isPrimary,
        notes: input.notes ?? existing.notes,
      },
    });
    return this.toDto(row);
  }

  async startConfig(id: string): Promise<HostTransportConfigDto> {
    const row = await this.prisma.hostTransportConfig.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`HostTransportConfig ${id} not found`);
    if (this.running.has(id)) return this.toDto(row);

    const transport = this.buildTransport(row);
    await transport.start();
    this.running.set(id, transport);

    await this.prisma.hostTransportConfig.update({
      where: { id },
      data: { enabled: true },
    });
    return this.toDto({ ...row, enabled: true });
  }

  async stopConfig(id: string): Promise<HostTransportConfigDto> {
    const row = await this.prisma.hostTransportConfig.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`HostTransportConfig ${id} not found`);
    const t = this.running.get(id);
    if (t) await t.stop();
    this.running.delete(id);
    await this.prisma.hostTransportConfig.update({
      where: { id },
      data: { enabled: false },
    });
    return this.toDto({ ...row, enabled: false });
  }

  /**
   * Activate exactly one config of the chosen kind, stopping any others of
   * the same kind. Used by the operator-console radio toggle.
   */
  async setActive(id: string): Promise<HostTransportConfigDto> {
    const target = await this.prisma.hostTransportConfig.findUnique({ where: { id } });
    if (!target) throw new NotFoundException(`HostTransportConfig ${id} not found`);
    const sameKind = await this.prisma.hostTransportConfig.findMany({
      where: { kind: target.kind, NOT: { id } },
    });
    for (const peer of sameKind) {
      if (this.running.has(peer.id)) {
        await this.stopConfig(peer.id);
      }
    }
    return this.startConfig(id);
  }

  async delete(id: string): Promise<void> {
    const row = await this.prisma.hostTransportConfig.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`HostTransportConfig ${id} not found`);
    if (this.running.has(id)) {
      await this.stopConfig(id);
    }
    await this.prisma.hostTransportConfig.delete({ where: { id } });
  }

  // ---- Internals -----------------------------------------------------------

  private buildTransport(row: { id: string; kind: string; bindAddress: string; port: number; switchProfile: string }): IHostTransport {
    const kind = this.requireKind(row.kind as HostTransportKind);
    const switchProfile = this.requireSwitch(row.switchProfile as IsoSwitchId);
    switch (kind) {
      case 'IN_PROCESS':
        return new InProcessTransport(row.id, switchProfile);
      case 'ISO8583_TCP':
        return new Iso8583TcpTransport(row.id, row.bindAddress, row.port, switchProfile, this.host);
      case 'ISO20022_HTTP':
        return new Iso20022HttpTransport(row.id, row.bindAddress, row.port, switchProfile, this.host);
    }
  }

  private toDto(row: {
    id: string; name: string; kind: string; bindAddress: string; port: number;
    switchProfile: string; tlsEnabled: boolean; enabled: boolean; isPrimary: boolean;
    notes: string | null;
  }): HostTransportConfigDto {
    const kind = this.requireKind(row.kind as HostTransportKind);
    const switchProfile = this.requireSwitch(row.switchProfile as IsoSwitchId);
    const live = this.running.get(row.id);
    const status: HostTransportRuntimeStatus = live
      ? live.status()
      : {
          kind,
          configId: row.id,
          listening: false,
          bindAddress: row.bindAddress,
          port: row.port,
          switchProfile,
          activeConnections: 0,
          totalRequests: 0,
          startedAt: null,
          lastError: null,
        };
    return {
      id: row.id,
      name: row.name,
      kind,
      bindAddress: row.bindAddress,
      port: row.port,
      switchProfile,
      tlsEnabled: row.tlsEnabled,
      enabled: row.enabled,
      isPrimary: row.isPrimary,
      notes: row.notes,
      status,
    };
  }

  private requireKind(kind: string | undefined): HostTransportKind {
    if (!kind || !VALID_KINDS.includes(kind as HostTransportKind)) {
      throw new BadRequestException(`Invalid kind '${kind}'. Use one of: ${VALID_KINDS.join(', ')}`);
    }
    return kind as HostTransportKind;
  }

  private requireSwitch(s: string): IsoSwitchId {
    if (!VALID_SWITCHES.includes(s as IsoSwitchId)) {
      throw new BadRequestException(
        `Invalid switchProfile '${s}'. Use one of: ${VALID_SWITCHES.join(', ')}`,
      );
    }
    return s as IsoSwitchId;
  }

  private normalizePort(kind: HostTransportKind, port: number | undefined): number {
    if (kind === 'IN_PROCESS') return 0;
    const p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      throw new BadRequestException(`port must be 1-65535 for ${kind}`);
    }
    return p;
  }

  /**
   * Seed three baseline rows on first boot so the operator console always has
   * something to toggle. Idempotent — uses `upsert` on `name`.
   */
  private async ensureSeedRows(): Promise<void> {
    const seeds: Array<Omit<HostTransportConfigDto, 'id' | 'status'>> = [
      {
        name: 'In-Process (default)',
        kind: 'IN_PROCESS',
        bindAddress: '127.0.0.1',
        port: 0,
        switchProfile: 'JALIN',
        tlsEnabled: false,
        enabled: true,
        isPrimary: true,
        notes: 'Direct method call from ATM state machine — no network. Default for native mode.',
      },
      {
        name: 'Jalin ISO 8583 TCP',
        kind: 'ISO8583_TCP',
        bindAddress: '127.0.0.1',
        port: 8583,
        switchProfile: 'JALIN',
        tlsEnabled: false,
        enabled: false,
        isPrimary: false,
        notes: '2-byte length-prefixed ASCII frames. Mandiri-anchored BIN ranges.',
      },
      {
        name: 'BI-FAST ISO 20022 HTTP',
        kind: 'ISO20022_HTTP',
        bindAddress: '127.0.0.1',
        port: 8443,
        switchProfile: 'BIFAST',
        tlsEnabled: false,
        enabled: false,
        isPrimary: false,
        notes: 'POST /pacs.008 → pacs.002 status report. BI-FAST style.',
      },
    ];
    for (const s of seeds) {
      await this.prisma.hostTransportConfig.upsert({
        where: { name: s.name },
        update: {},
        create: {
          name: s.name,
          kind: s.kind,
          bindAddress: s.bindAddress,
          port: s.port,
          switchProfile: s.switchProfile,
          tlsEnabled: s.tlsEnabled,
          enabled: s.enabled,
          isPrimary: s.isPrimary,
          notes: s.notes,
        },
      });
    }
  }
}
