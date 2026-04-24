import { Module } from '@nestjs/common';
import { MacrosController } from './macros.controller';
import { MacroRunnerService } from './macro-runner.service';
import { MacroRecorderService } from './macro-recorder.service';
import { AtmModule } from '../atm/atm.module';
import { XfsModule } from '../xfs/xfs.module';

/**
 * Macro Test Studio module — CRUD, run, and record.
 */
@Module({
  imports: [AtmModule, XfsModule],
  controllers: [MacrosController],
  providers: [MacroRunnerService, MacroRecorderService],
  exports: [MacroRunnerService, MacroRecorderService],
})
export class MacrosModule {}
