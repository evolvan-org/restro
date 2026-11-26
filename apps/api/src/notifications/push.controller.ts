import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type OkResponse,
  okResponseSchema,
  type PushConfigResponse,
  pushConfigResponseSchema,
  type PushSubscriptionRequest,
  pushSubscriptionRequestSchema,
  type PushUnsubscribeRequest,
  pushUnsubscribeRequestSchema,
} from '@rms/api-contract';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { PushService } from './push.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('config')
  @ApiOperation({ summary: 'VAPID public key for Web Push, or null when push is not configured' })
  @ApiOkResponse({ schema: zodOpenApiSchema(pushConfigResponseSchema) })
  config(): PushConfigResponse {
    return this.push.config();
  }

  @Post('subscriptions')
  @HttpCode(200)
  @ApiOperation({ summary: "Register this browser's push endpoint for the signed-in user" })
  @ApiBody({ schema: zodOpenApiSchema(pushSubscriptionRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(okResponseSchema) })
  async subscribe(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(pushSubscriptionRequestSchema)) input: PushSubscriptionRequest,
  ): Promise<OkResponse> {
    await this.push.subscribe(actor.restaurantId, actor.userId, input);
    return { ok: true };
  }

  @Delete('subscriptions')
  @ApiOperation({ summary: "Remove this browser's push endpoint" })
  @ApiBody({ schema: zodOpenApiSchema(pushUnsubscribeRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(okResponseSchema) })
  async unsubscribe(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(pushUnsubscribeRequestSchema)) input: PushUnsubscribeRequest,
  ): Promise<OkResponse> {
    await this.push.unsubscribe(actor.restaurantId, actor.userId, input.endpoint);
    return { ok: true };
  }
}
