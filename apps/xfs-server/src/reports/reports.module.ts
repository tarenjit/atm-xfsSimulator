import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { MacroRunsController } from './macro-runs.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController, MacroRunsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
