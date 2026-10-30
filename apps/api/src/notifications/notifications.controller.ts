import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type MarkNotificationsReadResponse,
  markNotificationsReadResponseSchema,
  type NotificationChannelAuthRequest,
  notificationChannelAuthRequestSchema,
  type NotificationChannelAuthResponse,
  notificationChannelAuthResponseSchema,
  type NotificationListQuery,
  notificationListQuerySchema,
  type NotificationListResponse,
  notificationListResponseSchema,
  type NotificationRealtimeConfig,
  notificationRealtimeConfigSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { NotificationPublisher } from './notification-publisher.service';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.DASHBOARD_READ)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Access denied'))
@ApiBadRequestResponse(apiError('Invalid request'))
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly publisher: NotificationPublisher,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "List the current user's notifications, newest first" })
  @ApiZodQuery(notificationListQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(notificationListResponseSchema) })
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(notificationListQuerySchema)) query: NotificationListQuery,
  ): Promise<NotificationListResponse> {
    return this.service.list(actor, query);
  }

  @Get('realtime')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "Get public Pusher settings and the current user's private channel" })
  @ApiOkResponse({ schema: zodOpenApiSchema(notificationRealtimeConfigSchema) })
  configuration(@CurrentActor() actor: Actor): NotificationRealtimeConfig {
    return this.publisher.configuration(actor);
  }

  @Post('auth')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "Authorize only the caller's private notification channel" })
  @ApiBody({ schema: zodOpenApiSchema(notificationChannelAuthRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(notificationChannelAuthResponseSchema) })
  authorize(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(notificationChannelAuthRequestSchema))
    input: NotificationChannelAuthRequest,
  ): NotificationChannelAuthResponse {
    return this.publisher.authorize(actor, input);
  }

  @Patch('read-all')
  @ApiOperation({ summary: "Mark all of the caller's notifications as read" })
  @ApiOkResponse({ schema: zodOpenApiSchema(markNotificationsReadResponseSchema) })
  markAllRead(@CurrentActor() actor: Actor): Promise<MarkNotificationsReadResponse> {
    return this.service.markRead(actor);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: "Mark one of the caller's notifications as read" })
  @ApiOkResponse({ schema: zodOpenApiSchema(markNotificationsReadResponseSchema) })
  @ApiNotFoundResponse(apiError('Notification not found'))
  markRead(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MarkNotificationsReadResponse> {
    return this.service.markRead(actor, id);
  }
}
