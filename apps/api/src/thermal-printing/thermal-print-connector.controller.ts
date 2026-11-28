import { Body, Controller, Get, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { type ThermalConnectorReply, thermalConnectorReplySchema } from '@rms/api-contract';
import type { Response } from 'express';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ThermalPrintConnectorService } from './thermal-print-connector.service';

@ApiExcludeController()
@Controller('thermal-print-connector')
export class ThermalPrintConnectorController {
  constructor(private readonly service: ThermalPrintConnectorService) {}

  @Get('connect')
  connect(
    @Headers('authorization') authorization: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    return this.service.connect(authorization, response);
  }

  @Post('reply')
  @HttpCode(204)
  reply(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(thermalConnectorReplySchema)) reply: ThermalConnectorReply,
  ): Promise<void> {
    return this.service.reply(authorization, reply);
  }
}
