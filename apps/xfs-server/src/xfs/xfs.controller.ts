import { Controller, Get, Param } from '@nestjs/common';
import { XfsManagerService } from './xfs-manager.service';

/**
 * REST surface for discovery of registered XFS services and their capabilities.
 * Command execution is WS-only (see XfsGateway) — REST is for introspection
 * and the operator console's device status view.
 */
@Controller({ path: 'xfs/services', version: '1' })
export class XfsController {
  constructor(private readonly manager: XfsManagerService) {}

  @Get()
  list() {
    return { services: this.manager.listServices() };
  }

  @Get(':hService/info')
  info(@Param('hService') hService: string) {
    const info = this.manager.getInfo(hService);
    if (!info) return { error: 'service not found', hService };
    return { hService, ...info };
  }
}
