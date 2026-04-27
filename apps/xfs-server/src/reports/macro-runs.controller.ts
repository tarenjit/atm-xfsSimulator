import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Macro-runs reporting surface (Phase 7.3).
 *
 * Two cross-macro views:
 *   GET /api/v1/macro-runs        — recent runs across every macro, with
 *                                    optional status / macro / date filters
 *   GET /api/v1/macro-runs/:id    — single run with full step results,
 *                                    parent macro details, and any
 *                                    transactions / sessions / commands
 *                                    that landed during the run window
 *
 * Per-macro listing (`GET /macros/:id/runs`) and PDF generation
 * (`GET /reports/macro-run/:id/pdf`, `GET /reports/executive`) already
 * exist — this controller is the cross-cutting Reports view that backs
 * the operator-console Reports panel.
 */
@ApiTags('reports')
@Controller({ path: 'macro-runs', version: '1' })
export class MacroRunsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List recent macro runs across all macros (filterable)' })
  @ApiQuery({ name: 'take', required: false, type: Number, description: 'Page size (default 50, max 200)' })
  @ApiQuery({ name: 'status', required: false, description: 'PASSED | FAILED | ABORTED | RUNNING' })
  @ApiQuery({ name: 'macroId', required: false, description: 'Filter to a specific macro' })
  @ApiQuery({ name: 'since', required: false, description: 'ISO date — runs started at or after' })
  async list(
    @Query('take') takeRaw?: string,
    @Query('status') status?: string,
    @Query('macroId') macroId?: string,
    @Query('since') since?: string,
  ) {
    const take = Math.max(1, Math.min(200, Number(takeRaw ?? 50)));
    const where: Record<string, unknown> = {};
    if (status && ['PASSED', 'FAILED', 'ABORTED', 'RUNNING'].includes(status.toUpperCase())) {
      where.status = status.toUpperCase();
    }
    if (macroId) where.macroId = macroId;
    if (since) {
      const d = new Date(since);
      if (!Number.isNaN(d.getTime())) where.startedAt = { gte: d };
    }

    const rows = await this.prisma.macroRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take,
      include: { macro: { select: { name: true, folder: true, tags: true } } },
    });

    // Aggregate status counts in the same window for the panel header.
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 30 * 86_400_000);
    const counts = await this.prisma.macroRun.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: { startedAt: { gte: sinceDate } },
    });
    const summary = {
      window: sinceDate.toISOString(),
      total: counts.reduce((n, c) => n + c._count._all, 0),
      passed: counts.find((c) => c.status === 'PASSED')?._count._all ?? 0,
      failed: counts.find((c) => c.status === 'FAILED')?._count._all ?? 0,
      aborted: counts.find((c) => c.status === 'ABORTED')?._count._all ?? 0,
      running: counts.find((c) => c.status === 'RUNNING')?._count._all ?? 0,
    };

    return {
      summary,
      runs: rows.map((r) => ({
        id: r.id,
        macroId: r.macroId,
        macroName: r.macro.name,
        macroFolder: r.macro.folder,
        macroTags: r.macro.tags,
        status: r.status,
        durationMs: r.durationMs,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        currentStep: r.currentStep,
        stepCount: Array.isArray(r.stepResults) ? (r.stepResults as unknown[]).length : 0,
      })),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single run with full step results + parent macro + linked artifacts' })
  async detail(@Param('id') id: string) {
    const run = await this.prisma.macroRun.findUnique({
      where: { id },
      include: { macro: true },
    });
    if (!run) throw new NotFoundException(`Macro run ${id} not found`);

    const startedAt = run.startedAt;
    const endedAt = run.completedAt ?? new Date();

    // Pull anything that landed during the run's wall-clock window. These
    // queries are deliberately broad — the operator can see "while this
    // macro ran, these transactions hit the host and these XFS commands
    // fired" — which is what makes a Reports view useful for debugging.
    const [transactions, commands, sessions] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { createdAt: { gte: startedAt, lte: endedAt } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
      this.prisma.xfsCommandLog.findMany({
        where: { createdAt: { gte: startedAt, lte: endedAt } },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      this.prisma.atmSession.findMany({
        where: { startedAt: { gte: startedAt, lte: endedAt } },
        orderBy: { startedAt: 'asc' },
        take: 10,
      }),
    ]);

    return {
      run: {
        id: run.id,
        status: run.status,
        durationMs: run.durationMs,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        currentStep: run.currentStep,
        stepResults: run.stepResults,
        evidence: run.evidence,
      },
      macro: {
        id: run.macro.id,
        name: run.macro.name,
        folder: run.macro.folder,
        description: run.macro.description,
        tags: run.macro.tags,
        steps: run.macro.steps,
      },
      transactions: transactions.map((t) => ({
        id: t.id,
        sessionId: t.sessionId,
        pan: t.pan,
        txnType: t.txnType,
        amount: t.amount.toString(),
        currency: t.currency,
        status: t.status,
        stanNo: t.stanNo,
        authCode: t.authCode,
        responseCode: t.responseCode,
        errorReason: t.errorReason,
        createdAt: t.createdAt,
      })),
      commands: commands.map((c) => ({
        id: c.id,
        sessionId: c.sessionId,
        hService: c.hService,
        commandCode: c.commandCode,
        result: c.result,
        durationMs: c.durationMs,
        createdAt: c.createdAt,
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        state: s.state,
        pan: s.pan,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        endReason: s.endReason,
      })),
    };
  }
}
