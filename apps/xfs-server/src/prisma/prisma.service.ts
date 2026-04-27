import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

type PrismaLogEntry =
  | 'query' | 'info' | 'warn' | 'error'
  | { emit: 'event' | 'stdout'; level: 'query' | 'info' | 'warn' | 'error' };

/**
 * PrismaService is a long-lived singleton. We log every query in debug mode
 * and every error at warn level for visibility in the XFS server log stream.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ] satisfies PrismaLogEntry[],
    });

    // Attach after super() so `this` is valid.
    (this as unknown as { $on: (e: string, cb: (payload: unknown) => void) => void }).$on(
      'query',
      (e) => {
        const ev = e as { query?: string; duration?: number };
        // Query-level logs are noisy; gate on LOG_LEVEL via NestJS Logger.
        this.logger.debug(`query (${ev.duration}ms): ${ev.query}`);
      },
    );
    (this as unknown as { $on: (e: string, cb: (payload: unknown) => void) => void }).$on(
      'warn',
      (e) => {
        const ev = e as { message?: string };
        this.logger.warn(`prisma warn: ${ev.message}`);
      },
    );
    (this as unknown as { $on: (e: string, cb: (payload: unknown) => void) => void }).$on(
      'error',
      (e) => {
        const ev = e as { message?: string };
        this.logger.error(`prisma error: ${ev.message}`);
      },
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}
