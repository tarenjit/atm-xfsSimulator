import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MacroRunnerService } from '../macros/macro-runner.service';
import { AtmAppService } from '../atm/atm-app.service';

export type SuiteRunSummary = {
  id: string;
  suiteId: string;
  status: 'PASSED' | 'FAILED' | 'ABORTED';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  macroRuns: Array<{
    macroId: string;
    macroRunId: string;
    status: string;
    durationMs: number;
  }>;
};

/**
 * Runs every macro in a suite sequentially.
 *
 * The ATM is a single-session model — running macros in parallel would
 * step on each other's state. Each macro is given a clean slate: any
 * lingering session from a prior macro is cancelled first, and between
 * macros we cancel again (a macro ending in ERROR without cleanup can
 * leave the ATM in a bad state).
 *
 * Suite status:
 *   - PASSED if every macro PASSED
 *   - FAILED if any macro FAILED
 *   - ABORTED if the suite was cancelled mid-run (Phase 9 adds this path)
 */
@Injectable()
export class SuiteRunnerService {
  private readonly logger = new Logger(SuiteRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: MacroRunnerService,
    private readonly atm: AtmAppService,
  ) {}

  async run(suiteId: string, triggeredBy: 'CRON' | 'MANUAL'): Promise<SuiteRunSummary> {
    const suite = await this.prisma.macroSuite.findUnique({ where: { id: suiteId } });
    if (!suite) throw new Error(`suite ${suiteId} not found`);

    const suiteRow = await this.prisma.macroSuiteRun.create({
      data: { suiteId, status: 'RUNNING', triggeredBy },
    });
    this.logger.log(`suite run ${suiteRow.id} started (${suite.macroIds.length} macros)`);

    const started = Date.now();
    const macroRuns: SuiteRunSummary['macroRuns'] = [];
    let overall: 'PASSED' | 'FAILED' = 'PASSED';

    for (const macroId of suite.macroIds) {
      // Clean slate for each macro.
      await this.safeCancel();
      try {
        const run = await this.runner.run(macroId);
        // Attach this run to the suite run row.
        await this.prisma.macroRun.update({
          where: { id: run.id },
          data: { suiteRunId: suiteRow.id },
        });
        macroRuns.push({
          macroId,
          macroRunId: run.id,
          status: run.status,
          durationMs: run.durationMs ?? 0,
        });
        if (run.status !== 'PASSED') overall = 'FAILED';
      } catch (err) {
        this.logger.error(`suite ${suiteId}: macro ${macroId} threw: ${String(err)}`);
        macroRuns.push({
          macroId,
          macroRunId: '',
          status: 'FAILED',
          durationMs: 0,
        });
        overall = 'FAILED';
      }
    }

    await this.safeCancel();

    const completedAt = new Date();
    const durationMs = Date.now() - started;
    await this.prisma.macroSuiteRun.update({
      where: { id: suiteRow.id },
      data: { status: overall, completedAt, durationMs },
    });

    this.logger.log(`suite run ${suiteRow.id} ${overall} in ${durationMs}ms`);

    return {
      id: suiteRow.id,
      suiteId,
      status: overall,
      startedAt: suiteRow.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
      macroRuns,
    };
  }

  private async safeCancel(): Promise<void> {
    if (!this.atm.getSession()) return;
    try {
      await this.atm.cancelTransaction('suite runner reset');
    } catch (err) {
      this.logger.warn(`safeCancel ignored error: ${String(err)}`);
    }
  }
}
