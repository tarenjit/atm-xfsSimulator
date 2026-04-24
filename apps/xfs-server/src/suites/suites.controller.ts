import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SuiteRunnerService } from './suite-runner.service';
import { SuiteSchedulerService } from './suite-scheduler.service';

interface SuiteBody {
  name?: unknown;
  macroIds?: unknown;
  cron?: unknown;
  enabled?: unknown;
}

function optionalString(v: unknown, field: string, max = 200): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || v.length > max) {
    throw new BadRequestException(`${field} must be a string ≤ ${max} chars`);
  }
  return v;
}

function requireString(v: unknown, field: string, max = 200): string {
  const s = optionalString(v, field, max);
  if (!s || s.length === 0) throw new BadRequestException(`${field} is required`);
  return s;
}

function optionalStringArray(v: unknown, field: string): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new BadRequestException(`${field} must be a string[]`);
  }
  return v as string[];
}

function optionalBool(v: unknown, field: string): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'boolean') throw new BadRequestException(`${field} must be a boolean`);
  return v;
}

/** Loose cron pattern check: accept 5 space-separated fields. */
function validateCron(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new BadRequestException(`${field} must be a string`);
  if (v.length === 0) return null as unknown as undefined; // clears cron
  const parts = v.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new BadRequestException(`${field} must be a 5-field cron expression`);
  }
  return v.trim();
}

@Controller({ path: 'suites', version: '1' })
export class SuitesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: SuiteRunnerService,
    private readonly scheduler: SuiteSchedulerService,
  ) {}

  @Get()
  async list() {
    const suites = await this.prisma.macroSuite.findMany({
      orderBy: [{ name: 'asc' }],
    });
    return { suites };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const suite = await this.prisma.macroSuite.findUnique({ where: { id } });
    if (!suite) throw new NotFoundException(`suite ${id} not found`);
    return { suite };
  }

  @Post()
  async create(@Body() body: SuiteBody) {
    const name = requireString(body.name, 'name');
    const macroIds = optionalStringArray(body.macroIds, 'macroIds') ?? [];
    const cron = validateCron(body.cron, 'cron');
    const enabled = optionalBool(body.enabled, 'enabled') ?? true;

    const suite = await this.prisma.macroSuite.create({
      data: { name, macroIds, cron: cron ?? null, enabled },
    });
    await this.scheduler.syncRepeatables();
    return { suite };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: SuiteBody) {
    const existing = await this.prisma.macroSuite.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`suite ${id} not found`);

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = requireString(body.name, 'name');
    if (body.macroIds !== undefined)
      data.macroIds = optionalStringArray(body.macroIds, 'macroIds');
    if (body.cron !== undefined) {
      const c = validateCron(body.cron, 'cron');
      data.cron = c ?? null;
    }
    if (body.enabled !== undefined) data.enabled = optionalBool(body.enabled, 'enabled');

    const suite = await this.prisma.macroSuite.update({ where: { id }, data });
    await this.scheduler.syncRepeatables();
    return { suite };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.prisma.macroSuite.delete({ where: { id } });
    await this.scheduler.syncRepeatables();
    return { deleted: id };
  }

  @Post(':id/run')
  async runNow(@Param('id') id: string) {
    const suite = await this.prisma.macroSuite.findUnique({ where: { id } });
    if (!suite) throw new NotFoundException(`suite ${id} not found`);
    const r = await this.scheduler.enqueueOnDemand(id);
    return { ok: true, ...r };
  }

  @Get(':id/runs')
  async runs(@Param('id') id: string) {
    const runs = await this.prisma.macroSuiteRun.findMany({
      where: { suiteId: id },
      orderBy: { startedAt: 'desc' },
      take: 30,
      include: { macroRuns: { select: { id: true, macroId: true, status: true, durationMs: true } } },
    });
    return { runs };
  }
}
