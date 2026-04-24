import { Module } from '@nestjs/common';
import { ZxfsBridgeService } from './zxfs-bridge.service';
import { XfsModule } from '../xfs/xfs.module';

@Module({
  imports: [XfsModule],
  providers: [ZxfsBridgeService],
})
export class BridgeModule {}
