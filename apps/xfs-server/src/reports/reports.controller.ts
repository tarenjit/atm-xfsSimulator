import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('macro-run/:id/pdf')
  @ApiOperation({ summary: 'PDF report for a single macro run' })
  @Header('Content-Type', 'application/pdf')
  async macroRunPdf(@Param('id') id: string, @Res({ passthrough: false }) res: Response) {
    const buffer = await this.reports.generateMacroRunPdf(id);
    res.setHeader('Content-Disposition', `attachment; filename="macro-run-${id}.pdf"`);
    res.send(buffer);
  }

  @Get('executive')
  @ApiOperation({ summary: 'Executive summary PDF for a YYYY-MM window' })
  @Header('Content-Type', 'application/pdf')
  async executivePdf(@Query('month') month: string, @Res({ passthrough: false }) res: Response) {
    const buffer = await this.reports.generateExecutivePdf(month);
    res.setHeader('Content-Disposition', `attachment; filename="executive-${month}.pdf"`);
    res.send(buffer);
  }
}
