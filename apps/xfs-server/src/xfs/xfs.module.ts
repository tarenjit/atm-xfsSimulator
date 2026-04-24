import { Module } from '@nestjs/common';
import { XfsManagerService } from './xfs-manager.service';
import { XfsGateway } from './xfs.gateway';
import { XfsController } from './xfs.controller';

/**
 * XFS module — Phase 1 scaffolds the Manager, Gateway, and REST controller.
 * Device providers (IDC, PIN, CDM, PTR) are registered in Phase 2.
 */
@Module({
  controllers: [XfsController],
  providers: [XfsManagerService, XfsGateway],
  exports: [XfsManagerService],
})
export class XfsModule {}
