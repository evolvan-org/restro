import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type StatusResponse, statusResponseSchema } from '@rms/api-contract';

import { zodOpenApiSchema } from '../common/swagger/zod-openapi';

@ApiTags('status')
@Controller('status')
export class StatusController {
  @Get()
  @ApiOperation({ summary: 'Report that the API is online' })
  @ApiOkResponse({
    description: 'The API is online',
    schema: zodOpenApiSchema(statusResponseSchema),
  })
  getStatus(): StatusResponse {
    return {
      status: 'online',
      service: 'rms-api',
      version: '0.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
