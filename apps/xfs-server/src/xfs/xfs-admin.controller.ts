import { Body, Controller, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { XfsResult } from '@atm/xfs-core';
import { XfsManagerService } from './xfs-manager.service';

class InjectErrorDto {
  @IsInt()
  @Min(-11)
  @Max(0)
  errorCode!: XfsResult;
}

class SetDelayDto {
  @IsInt()
  @Min(0)
  @Max(30_000)
  ms!: number;
}

class ResetDto {
  @IsOptional()
  reason?: string;
}

/**
 * Admin operations on XFS services: inject errors, reset, set response delay.
 * Separate from XfsController to keep discovery endpoints read-only.
 */
@Controller({ path: 'xfs/services', version: '1' })
export class XfsAdminController {
  constructor(private readonly manager: XfsManagerService) {}

  @Post(':hService/inject-error')
  injectError(@Param('hService') hService: string, @Body() body: InjectErrorDto) {
    const svc = this.manager.getService(hService);
    if (!svc) throw new NotFoundException(`service ${hService} not found`);
    svc.injectError(body.errorCode);
    return { ok: true, hService, injected: XfsResult[body.errorCode] };
  }

  @Post(':hService/clear-error')
  clearError(@Param('hService') hService: string) {
    const svc = this.manager.getService(hService);
    if (!svc) throw new NotFoundException(`service ${hService} not found`);
    svc.clearError();
    return { ok: true, hService };
  }

  @Post(':hService/reset')
  reset(@Param('hService') hService: string, @Body() _body: ResetDto) {
    const svc = this.manager.getService(hService);
    if (!svc) throw new NotFoundException(`service ${hService} not found`);
    svc.reset();
    return { ok: true, hService };
  }

  @Patch(':hService/delay')
  setDelay(@Param('hService') hService: string, @Body() body: SetDelayDto) {
    const svc = this.manager.getService(hService);
    if (!svc) throw new NotFoundException(`service ${hService} not found`);
    svc.setResponseDelay(body.ms);
    return { ok: true, hService, delayMs: body.ms };
  }
}
