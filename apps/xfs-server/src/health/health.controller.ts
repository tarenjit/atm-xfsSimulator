import { Controller, Get, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health endpoints.
 *   - GET /api/v1/health       → liveness (process is running)
 *   - GET /api/v1/health/ready  → readiness (db reachable)
 */
@Controller({ path: 'health', version: '1' })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  live() {
    return {
      status: 'ok',
      service: 'xfs-server',
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', db: 'up', timestamp: new Date().toISOString() };
    } catch (err) {
      this.logger.warn(`readiness check failed: ${String(err)}`);
      return { status: 'not_ready', db: 'down', timestamp: new Date().toISOString() };
    }
  }
}
