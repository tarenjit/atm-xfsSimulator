import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { AtmModule } from '../atm/atm.module';
import { XfsModule } from '../xfs/xfs.module';

@Module({
  imports: [AtmModule, XfsModule],
  controllers: [SessionsController],
})
export class SessionsModule {}
