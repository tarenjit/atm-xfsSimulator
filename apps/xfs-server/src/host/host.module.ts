import { Module } from '@nestjs/common';
import { HostEmulatorService } from './host-emulator.service';

@Module({
  providers: [HostEmulatorService],
  exports: [HostEmulatorService],
})
export class HostModule {}
