import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HostTransportManagerService,
  type CreateOrUpdateHostTransportInput,
} from './host-transport-manager.service';

@ApiTags('host-transport')
@Controller({ path: 'host-transport', version: '1' })
export class HostTransportController {
  constructor(private readonly mgr: HostTransportManagerService) {}

  @Get()
  @ApiOperation({ summary: 'List host-transport configs and their live status' })
  async list() {
    return { transports: await this.mgr.list() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one host-transport config' })
  async get(@Param('id') id: string) {
    return await this.mgr.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new host-transport config (does not auto-start)' })
  async create(@Body() body: CreateOrUpdateHostTransportInput) {
    return await this.mgr.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a host-transport config (must be stopped first)' })
  async update(@Param('id') id: string, @Body() body: CreateOrUpdateHostTransportInput) {
    return await this.mgr.update(id, body);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start the listener for this config' })
  async start(@Param('id') id: string) {
    return await this.mgr.startConfig(id);
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop the listener for this config' })
  async stop(@Param('id') id: string) {
    return await this.mgr.stopConfig(id);
  }

  @Post(':id/activate')
  @ApiOperation({
    summary: 'Make this the only active listener of its kind (radio toggle)',
  })
  async activate(@Param('id') id: string) {
    return await this.mgr.setActive(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a host-transport config (auto-stops if running)' })
  async delete(@Param('id') id: string) {
    await this.mgr.delete(id);
    return { ok: true };
  }
}
