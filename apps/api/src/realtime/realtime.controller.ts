import { Body, Controller, Get, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type PusherAuthorizeRequest,
  pusherAuthorizeRequestSchema,
  type PusherAuthorizeResponse,
  pusherAuthorizeResponseSchema,
  type PusherClientConfig,
  pusherClientConfigSchema,
} from '@rms/api-contract';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { RealtimeService } from './realtime.service';

@ApiTags('real-time updates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing permission or another restaurant channel'))
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly service: RealtimeService) {}

  @Get('config')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get the public Pusher settings and the caller authorized channels' })
  @ApiOkResponse({ schema: zodOpenApiSchema(pusherClientConfigSchema) })
  config(@CurrentActor() actor: Actor): PusherClientConfig {
    return this.service.clientConfig(actor);
  }

  @Post('auth')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Authorize a private restaurant channel using current permissions' })
  @ApiBody({ schema: zodOpenApiSchema(pusherAuthorizeRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(pusherAuthorizeResponseSchema) })
  @ApiBadRequestResponse(apiError('Invalid socket id or channel name'))
  authorize(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(pusherAuthorizeRequestSchema)) input: PusherAuthorizeRequest,
  ): PusherAuthorizeResponse {
    return this.service.authorize(actor, input);
  }
}
