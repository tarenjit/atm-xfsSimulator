import { Module } from '@nestjs/common';
import { MacrosController } from './macros.controller';
import { MacroRunnerService } from './macro-runner.service';
import { AtmModule } from '../atm/atm.module';
import { XfsModule } from '../xfs/xfs.module';

/**
 * Macro Test Studio module.
 *
 * Exposes CRUD + a run endpoint for named macros. Depends on AtmModule
 * (to drive the state machine) and XfsModule (to access the individual
 * device services for fine-grained actions / checkpoints).
 */
@Module({
  imports: [AtmModule, XfsModule],
  controllers: [MacrosController],
  providers: [MacroRunnerService],
  exports: [MacroRunnerService],
})
export class MacrosModule {}
