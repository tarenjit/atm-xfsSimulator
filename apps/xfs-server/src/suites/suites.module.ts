import { Module } from '@nestjs/common';
import { SuitesController } from './suites.controller';
import { SuiteRunnerService } from './suite-runner.service';
import { SuiteSchedulerService } from './suite-scheduler.service';
import { MacrosModule } from '../macros/macros.module';
import { AtmModule } from '../atm/atm.module';

@Module({
  imports: [MacrosModule, AtmModule],
  controllers: [SuitesController],
  providers: [SuiteRunnerService, SuiteSchedulerService],
  exports: [SuiteRunnerService, SuiteSchedulerService],
})
export class SuitesModule {}
