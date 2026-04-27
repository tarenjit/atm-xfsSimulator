import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HostModule } from '../host/host.module';
import { HostTransportController } from './host-transport.controller';
import { HostTransportManagerService } from './host-transport-manager.service';

@Module({
  imports: [PrismaModule, HostModule],
  controllers: [HostTransportController],
  providers: [HostTransportManagerService],
  exports: [HostTransportManagerService],
})
export class HostTransportModule {}
