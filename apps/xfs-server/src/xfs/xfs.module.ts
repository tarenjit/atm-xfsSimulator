import { Module, OnModuleInit } from '@nestjs/common';
import { XfsManagerService } from './xfs-manager.service';
import { XfsGateway } from './xfs.gateway';
import { XfsController } from './xfs.controller';
import { XfsAdminController } from './xfs-admin.controller';
import {
  CdmDeviceService,
  IdcDeviceService,
  PinDeviceService,
  PtrDeviceService,
} from '@atm/xfs-devices';

/**
 * XFS module.
 *
 * All four virtual devices (IDC, PIN, CDM, PTR) are instantiated as NestJS
 * singletons and auto-registered with the manager on module init.
 */
@Module({
  controllers: [XfsController, XfsAdminController],
  providers: [
    XfsManagerService,
    XfsGateway,
    IdcDeviceService,
    PinDeviceService,
    CdmDeviceService,
    PtrDeviceService,
  ],
  exports: [
    XfsManagerService,
    IdcDeviceService,
    PinDeviceService,
    CdmDeviceService,
    PtrDeviceService,
  ],
})
export class XfsModule implements OnModuleInit {
  constructor(
    private readonly manager: XfsManagerService,
    private readonly idc: IdcDeviceService,
    private readonly pin: PinDeviceService,
    private readonly cdm: CdmDeviceService,
    private readonly ptr: PtrDeviceService,
  ) {}

  onModuleInit(): void {
    this.manager.registerService(this.idc);
    this.manager.registerService(this.pin);
    this.manager.registerService(this.cdm);
    this.manager.registerService(this.ptr);
  }
}
