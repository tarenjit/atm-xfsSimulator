import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { MacroRunnerService } from './macro-runner.service';
import type { MacroStep } from './macro.types';

class CreateMacroDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  folder?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsArray()
  steps?: MacroStep[];

  @IsOptional()
  variables?: Record<string, unknown>;
}

class UpdateMacroDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  folder?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsArray()
  steps?: MacroStep[];

  @IsOptional()
  variables?: Record<string, unknown>;
}

@Controller({ path: 'macros', version: '1' })
export class MacrosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: MacroRunnerService,
  ) {}

  @Get()
  async list() {
    const macros = await this.prisma.macro.findMany({
      orderBy: [{ folder: 'asc' }, { name: 'asc' }],
    });
    return { macros };
  }

  @Get(':id')
  async one(@Param('id') id: string) {
    const macro = await this.prisma.macro.findUnique({ where: { id } });
    if (!macro) throw new NotFoundException(`macro ${id} not found`);
    return { macro };
  }

  @Post()
  async create(@Body() body: CreateMacroDto) {
    const macro = await this.prisma.macro.create({
      data: {
        name: body.name,
        folder: body.folder ?? null,
        description: body.description ?? null,
        tags: body.tags ?? [],
        steps: (body.steps ?? []) as unknown as object,
        variables: (body.variables ?? {}) as unknown as object,
      },
    });
    return { macro };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateMacroDto) {
    const exists = await this.prisma.macro.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`macro ${id} not found`);
    const macro = await this.prisma.macro.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.folder !== undefined && { folder: body.folder }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.steps !== undefined && { steps: body.steps as unknown as object }),
        ...(body.variables !== undefined && {
          variables: body.variables as unknown as object,
        }),
      },
    });
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
}
