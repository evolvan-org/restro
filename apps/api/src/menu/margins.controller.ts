import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type BulkImportMenuItemsRequest,
  bulkImportMenuItemsRequestSchema,
  type BulkImportMenuItemsResponse,
  bulkImportMenuItemsResponseSchema,
  type MarginPreviewRequest,
  marginPreviewRequestSchema,
  type MarginPreviewResponse,
  marginPreviewResponseSchema,
  type MarginReport,
  marginReportSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { MarginsService } from './margins.service';
import { MenuImportService } from './menu-import.service';

@ApiTags('menu')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@Controller()
export class MarginsController {
  constructor(
    private readonly margins: MarginsService,
    private readonly imports: MenuImportService,
  ) {}

  @Get('margins')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'Plate cost, food-cost % and margin for every dish with a recipe' })
  @ApiOkResponse({ schema: zodOpenApiSchema(marginReportSchema) })
  report(@CurrentActor() actor: Actor): Promise<MarginReport> {
    return this.margins.report(actor);
  }

  @Post('margins/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'How margins change if ingredients cost what an invoice says' })
  @ApiBody({ schema: zodOpenApiSchema(marginPreviewRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(marginPreviewResponseSchema) })
  preview(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(marginPreviewRequestSchema)) input: MarginPreviewRequest,
  ): Promise<MarginPreviewResponse> {
    return this.margins.preview(actor, input);
  }

  @Post('menu-items/bulk-import')
  @RequirePermissions(Permission.MENU_WRITE)
  @ApiOperation({
    summary: 'Add reviewed rows (e.g. from a menu photo) to the live menu',
    description: 'Names already in that category are skipped and reported, never overwritten.',
  })
  @ApiBody({ schema: zodOpenApiSchema(bulkImportMenuItemsRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(bulkImportMenuItemsResponseSchema) })
  bulkImport(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(bulkImportMenuItemsRequestSchema))
    input: BulkImportMenuItemsRequest,
  ): Promise<BulkImportMenuItemsResponse> {
    return this.imports.import(actor, input);
  }
}
