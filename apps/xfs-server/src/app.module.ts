import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { buildPinoOptions } from './config/logger.config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { XfsModule } from './xfs/xfs.module';
import { HostModule } from './host/host.module';
import { AtmModule } from './atm/atm.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    LoggerModule.forRoot(buildPinoOptions()),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 50,
      verboseMemoryLeak: true,
    }),
    PrismaModule,
    HealthModule,
    XfsModule,
    HostModule,
    AtmModule,
    SessionsModule,
  ],
})
export class AppModule {}
