import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { CdmDeviceService } from '@atm/xfs-devices';

class ReplenishDto {
  @IsInt()
  @Min(0)
  count!: number;
}

@Controller({ path: 'cassettes', version: '1' })
export class CassettesController {
  constructor(private readonly cdm: CdmDeviceService) {}

  @Get()
  list() {
    return { cassettes: this.cdm.getUnits() };
  }

  @Patch(':unitId/replenish')
  replenish(@Param('unitId') unitId: string, @Body() body: ReplenishDto) {
    const unit = this.cdm.replenishCassette(unitId, body.count);
    return { unit };
  }

  @Post(':unitId/jam')
  jam(@Param('unitId') unitId: string) {
    this.cdm.simulateJam(unitId);
    return { ok: true };
  }

  @Post(':unitId/clear-jam')
  clearJam(@Param('unitId') unitId: string) {
    this.cdm.clearJam(unitId);
    return { ok: true };
  }
}
