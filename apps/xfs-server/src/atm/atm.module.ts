import { Module } from '@nestjs/common';
import { AtmAppService } from './atm-app.service';
import { HostModule } from '../host/host.module';
import { XfsModule } from '../xfs/xfs.module';

@Module({
  imports: [HostModule, XfsModule],
  providers: [AtmAppService],
  exports: [AtmAppService],
})
export class AtmModule {}
