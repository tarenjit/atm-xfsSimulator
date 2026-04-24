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
import { MacroRunnerService } from './macro-runner.service';
import { MacroRecorderService } from './macro-recorder.service';
import type { MacroStep } from './macro.types';

/**
 * Plain-object body shape. We deliberately skip class-validator DTOs for
 * macro CRUD because `steps` and `variables` are JSONB blobs — the global
 * ValidationPipe's `whitelist: true` strips unknown properties from nested
 * objects, which destroys every step's inner fields. We validate the
 * top-level primitives inline below.
 */
interface CreateMacroBody {
  name?: unknown;
  folder?: unknown;
  description?: unknown;
  tags?: unknown;
  steps?: unknown;
  variables?: unknown;
}

type UpdateMacroBody = CreateMacroBody;

function requireString(v: unknown, field: string, max = 200): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) {
    throw new BadRequestException(`${field} must be a non-empty string (≤ ${max} chars)`);
  }
  return v;
}

function optionalString(v: unknown, field: string, max = 1000): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string' || v.length > max) {
    throw new BadRequestException(`${field} must be a string (≤ ${max} chars)`);
  }
  return v;
}

function optionalStringArray(v: unknown, field: string): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new BadRequestException(`${field} must be a string[]`);
  }
  return v as string[];
}

function optionalStepArray(v: unknown, field: string): MacroStep[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) {
    throw new BadRequestException(`${field} must be an array of MacroStep objects`);
  }
  // Shallow shape check per element — enough to guard against "stray" posts.
  // Deeper runtime validation is the runner's job (it throws on malformed steps).
  for (const s of v) {
    if (!s || typeof s !== 'object') {
      throw new BadRequestException(`${field}[*] must be an object`);
    }
    const step = s as Record<string, unknown>;
    if (
      typeof step.id !== 'string' ||
      typeof step.device !== 'string' ||
      typeof step.operation !== 'string'
    ) {
      throw new BadRequestException(`${field}[*] requires id, device, operation as strings`);
    }
  }
  return v as MacroStep[];
}

@Controller({ path: 'macros', version: '1' })
export class MacrosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: MacroRunnerService,
    private readonly recorder: MacroRecorderService,
  ) {}

  @Get()
  async list() {
    const macros = await this.prisma.macro.findMany({
      orderBy: [{ folder: 'asc' }, { name: 'asc' }],
    });
    return { macros };
  }

  // Recorder status lives here (before :id) so it doesn't get routed as
  // GET /macros/:id with id="record".
  @Get('recorder/status')
  recordStatus() {
    return this.recorder.status();
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const macro = await this.prisma.macro.findUnique({ where: { id } });
    if (!macro) throw new NotFoundException(`macro ${id} not found`);
    return { macro };
  }

  @Post()
  async create(@Body() body: CreateMacroBody) {
    const name = requireString(body.name, 'name');
    const folder = optionalString(body.folder, 'folder');
    const description = optionalString(body.description, 'description');
    const tags = optionalStringArray(body.tags, 'tags') ?? [];
    const steps = optionalStepArray(body.steps, 'steps') ?? [];
    const variables = (
      body.variables && typeof body.variables === 'object' ? body.variables : {}
    ) as object;

    const macro = await this.prisma.macro.create({
      data: {
        name,
        folder: folder ?? null,
        description: description ?? null,
        tags,
        steps: steps as unknown as object,
        variables,
      },
    });
    return { macro };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateMacroBody) {
    const exists = await this.prisma.macro.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`macro ${id} not found`);

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = requireString(body.name, 'name');
    if (body.folder !== undefined) data.folder = optionalString(body.folder, 'folder');
    if (body.description !== undefined)
      data.description = optionalString(body.description, 'description');
    if (body.tags !== undefined) data.tags = optionalStringArray(body.tags, 'tags');
    if (body.steps !== undefined) data.steps = optionalStepArray(body.steps, 'steps');
    if (body.variables !== undefined) {
      if (!body.variables || typeof body.variables !== 'object' || Array.isArray(body.variables)) {
        throw new BadRequestException('variables must be an object');
      }
      data.variables = body.variables;
    }

    const macro = await this.prisma.macro.update({ where: { id }, data });
    return { macro };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.prisma.macro.delete({ where: { id } });
    return { deleted: id };
  }

  @Post(':id/run')
  async run(@Param('id') id: string) {
    const run = await this.runner.run(id);
    return { run };
  }

  @Get(':id/runs')
  async runs(@Param('id') id: string) {
    const runs = await this.prisma.macroRun.findMany({
      where: { macroId: id },
      orderBy: { startedAt: 'desc' },
      take: 30,
    });
    return { runs };
  }

  @Post(':id/record/start')
  async recordStart(@Param('id') id: string) {
    const r = await this.recorder.startRecording(id);
    return { recording: true, ...r };
  }

  @Post(':id/record/stop')
  async recordStop(@Param('id') _id: string) {
    const r = await this.recorder.stopRecording();
    if (!r) return { recording: false };
    return { recording: false, ...r };
  }
}
