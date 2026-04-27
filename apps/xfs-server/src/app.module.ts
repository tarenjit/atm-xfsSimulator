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
import { CardsModule } from './cards/cards.module';
import { CassettesModule } from './cassettes/cassettes.module';
import { LogsModule } from './logs/logs.module';
import { ThemesModule } from './themes/themes.module';
import { MacrosModule } from './macros/macros.module';
import { SuitesModule } from './suites/suites.module';
import { BridgeModule } from './bridge/bridge.module';
import { ReportsModule } from './reports/reports.module';
import { HostTransportModule } from './host-transport/host-transport.module';

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
    CardsModule,
    CassettesModule,
    LogsModule,
    ThemesModule,
    MacrosModule,
    SuitesModule,
    BridgeModule,
    ReportsModule,
    HostTransportModule,
  ],
})
export class AppModule {}
