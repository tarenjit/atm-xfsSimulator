import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';

class SetActiveDto {
  @IsString()
  @Matches(/^[a-z0-9_-]{2,32}$/)
  code!: string;
}

@Controller({ path: 'themes', version: '1' })
export class ThemesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @Get()
  async list() {
    const themes = await this.prisma.bankTheme.findMany({ orderBy: { name: 'asc' } });
    return { themes };
  }

  @Get('active')
  async active() {
    const theme =
      (await this.prisma.bankTheme.findFirst({ where: { isDefault: true } })) ??
      (await this.prisma.bankTheme.findFirst());
    if (!theme) throw new NotFoundException('no themes seeded');
    return { theme };
  }

  /**
   * Flip which bank theme is active. Runs in a single transaction so
   * at most one row has isDefault=true at any time. Emits atm.themeChanged
   * so connected clients can re-fetch without polling.
   */
  @Patch('active')
  async setActive(@Body() body: SetActiveDto) {
    const next = await this.prisma.bankTheme.findUnique({ where: { code: body.code } });
    if (!next) throw new NotFoundException(`no theme with code ${body.code}`);

    await this.prisma.$transaction([
      this.prisma.bankTheme.updateMany({ data: { isDefault: false } }),
      this.prisma.bankTheme.update({
        where: { code: body.code },
        data: { isDefault: true },
      }),
    ]);

    this.events.emit('atm.themeChanged', { theme: { ...next, isDefault: true } });
    return { theme: { ...next, isDefault: true } };
  }

  @Get(':code')
  async one(@Param('code') code: string) {
    const theme = await this.prisma.bankTheme.findUnique({ where: { code } });
    if (!theme) throw new NotFoundException(`no theme with code ${code}`);
    return { theme };
  }
}
