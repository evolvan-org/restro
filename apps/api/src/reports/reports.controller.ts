import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type DailySalesReport,
  dailySalesReportSchema,
  type GstReport,
  gstReportSchema,
  REPORT_DEFAULT_DAYS,
  reportDateRangeParamsSchema,
  type ReportDateRangeQuery,
  reportDateRangeQuerySchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { ReportsService } from './reports.service';

const rangeDescription = `Without dates, returns the last ${REPORT_DEFAULT_DAYS} restaurant-local days including today.`;

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.DASHBOARD_READ)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing dashboard permission'))
@ApiBadRequestResponse(apiError('Invalid or oversized date range'))
@ApiNotFoundResponse(apiError('The restaurant no longer exists'))
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily-sales')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get daily revenue and paid order counts',
    description: rangeDescription,
  })
  @ApiZodQuery(reportDateRangeParamsSchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(dailySalesReportSchema) })
  dailySales(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(reportDateRangeQuerySchema)) query: ReportDateRangeQuery,
  ): Promise<DailySalesReport> {
    return this.reports.dailySales(actor, query);
  }

  @Get('gst')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get daily taxable value and GST collected',
    description: rangeDescription,
  })
  @ApiZodQuery(reportDateRangeParamsSchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(gstReportSchema) })
  gst(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(reportDateRangeQuerySchema)) query: ReportDateRangeQuery,
  ): Promise<GstReport> {
    return this.reports.gst(actor, query);
  }
}
