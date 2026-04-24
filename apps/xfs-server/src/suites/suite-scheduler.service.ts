import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, JobsOptions } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SuiteRunnerService } from './suite-runner.service';

const QUEUE_NAME = 'macro-suites';

export function jobIdFor(suiteId: string): string {
  return `suite-${suiteId}`;
}

/**
 * BullMQ-backed scheduler for macro suites.
 *
 * On boot: loads every enabled MacroSuite with a non-null cron and
 * registers a BullMQ repeatable job. Each firing enqueues the suite id;
 * the worker pulls the job and delegates to SuiteRunnerService.
 *
 * Disabling the bridge: set ZXFS_SUITE_SCHEDULER_ENABLED=false to skip
 * queue + worker startup entirely (useful for tests and for installs
 * without Redis reachable).
 */
@Injectable()
export class SuiteSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SuiteSchedulerService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: SuiteRunnerService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.ZXFS_SUITE_SCHEDULER_ENABLED === 'false') {
      this.logger.log('suite scheduler disabled via env');
      return;
    }

    const connection = {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
    };

    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const suiteId = job.data.suiteId as string;
        this.logger.log(`worker picked up suite ${suiteId} (job ${job.id})`);
        return this.runner.run(suiteId, 'CRON');
      },
      {
        connection,
        concurrency: 1, // serialize suite runs; ATM is single-session
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`worker failed ${job?.id}: ${err.message}`);
    });

    // Re-register repeatable jobs from DB state.
    await this.syncRepeatables();
    this.logger.log(`suite scheduler up (queue=${QUEUE_NAME}, redis=${connection.host}:${connection.port})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.worker = null;
    this.queue = null;
  }

  /**
   * Enqueue a suite to run as soon as the worker picks it up.
   * If the scheduler is disabled, runs inline — better than silently
   * no-op'ing for demo/test runs.
   */
  async enqueueOnDemand(suiteId: string): Promise<{ jobId: string | null; inline: boolean }> {
    if (!this.queue) {
      await this.runner.run(suiteId, 'MANUAL');
      return { jobId: null, inline: true };
    }
    const job = await this.queue.add(
      `suite-${suiteId}-manual-${Date.now()}`,
      { suiteId, triggeredBy: 'MANUAL' },
      { removeOnComplete: 100, removeOnFail: 100 },
    );
    return { jobId: String(job.id ?? ''), inline: false };
  }

  /**
   * Re-sync repeatable jobs after a suite's cron changes.
   * Removes any stale repeatables for suites that no longer exist or
   * have enabled=false / cron=null.
   */
  async syncRepeatables(): Promise<void> {
    if (!this.queue) return;

    const [suites, existing] = await Promise.all([
      this.prisma.macroSuite.findMany({ where: { enabled: true } }),
      this.queue.getRepeatableJobs(),
    ]);

    const wanted = new Map<string, { suiteId: string; cron: string }>();
    for (const s of suites) {
      if (s.cron) wanted.set(jobIdFor(s.id), { suiteId: s.id, cron: s.cron });
    }

    // Remove repeatables we no longer want.
    for (const r of existing) {
      const key = r.id ?? r.name;
      if (key && !wanted.has(key)) {
        await this.queue.removeRepeatableByKey(r.key);
        this.logger.log(`removed stale repeatable ${key}`);
      }
    }

    // Add / refresh repeatables we do want.
    for (const [id, { suiteId, cron }] of wanted) {
      const opts: JobsOptions = {
        jobId: id,
        repeat: { pattern: cron },
        removeOnComplete: 100,
        removeOnFail: 100,
      };
      await this.queue.add(id, { suiteId, triggeredBy: 'CRON' }, opts);
      this.logger.log(`registered repeatable ${id} cron="${cron}"`);
    }
  }
}
