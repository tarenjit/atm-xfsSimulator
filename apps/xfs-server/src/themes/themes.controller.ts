import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller({ path: 'themes', version: '1' })
export class ThemesController {
  constructor(private readonly prisma: PrismaService) {}

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

  @Get(':code')
  async one(@Param('code') code: string) {
    const theme = await this.prisma.bankTheme.findUnique({ where: { code } });
    if (!theme) throw new NotFoundException(`no theme with code ${code}`);
    return { theme };
  }
}
