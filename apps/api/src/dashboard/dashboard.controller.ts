import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type TodaySummary, todaySummarySchema } from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.DASHBOARD_READ)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing dashboard permission'))
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('today-summary')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "Get today's restaurant-local dashboard metrics" })
  @ApiOkResponse({ schema: zodOpenApiSchema(todaySummarySchema) })
  @ApiNotFoundResponse(apiError('The restaurant no longer exists'))
  todaySummary(@CurrentActor() actor: Actor): Promise<TodaySummary> {
    return this.dashboard.todaySummary(actor);
  }
}
