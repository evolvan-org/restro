import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { StatusResponse } from '@rms/api-contract';

@ApiTags('status')
@Controller('status')
export class StatusController {
  @Get()
  @ApiOperation({ summary: 'Report that the API is online' })
  getStatus(): StatusResponse {
    return {
      status: 'online',
      service: 'rms-api',
      version: '0.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
