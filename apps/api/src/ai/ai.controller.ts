import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type AiJobDetailResponse,
  aiJobDetailResponseSchema,
  type AiJobItemsQuery,
  aiJobItemsQuerySchema,
  aiQuotaErrorSchema,
  type AiRealtimeConfig,
  aiRealtimeConfigSchema,
  type AiUsageResponse,
  aiUsageResponseSchema,
  type CreateRecipeDraftRequest,
  createRecipeDraftRequestSchema,
  type CreateScanFields,
  createScanFieldsSchema,
  type NotificationChannelAuthRequest,
  notificationChannelAuthRequestSchema,
  type NotificationChannelAuthResponse,
  SCAN_MAX_PAGE_BYTES,
  SCAN_MAX_PAGES,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import type { Response } from 'express';
import { z } from 'zod';

import { AllowDuringSetup } from '../common/auth/allow-during-setup.decorator';
import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { AiJobsService, type UploadedPage } from './jobs/ai-jobs.service';
import { AiRealtimePublisher } from './jobs/ai-realtime.publisher';

const scanUpload = FilesInterceptor('pages', SCAN_MAX_PAGES, {
  limits: { fileSize: SCAN_MAX_PAGE_BYTES, files: SCAN_MAX_PAGES, fields: 4 },
});
const pageUpload = FileInterceptor('page', {
  limits: { fileSize: SCAN_MAX_PAGE_BYTES, files: 1, fields: 0 },
});
const scanBody = {
  schema: {
    type: 'object',
    required: ['pages', 'context'],
    properties: {
      pages: { type: 'array', items: { type: 'string', format: 'binary' } },
      context: { type: 'string', enum: ['ONBOARDING', 'POST_ONBOARDING'] },
      pageInfo: { type: 'string', description: 'JSON array of { width, height, sharpness? }' },
    },
  },
};
const cancelBodySchema = z.object({ purge: z.boolean().optional() }).strict();

/**
 * AI assistance. Every route is callable during owner setup; results only ever feed drafts the
 * owner reviews. Uploads are photos already normalised by the browser (JPEG / PNG / WebP).
 */
@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AllowDuringSetup()
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@Controller('ai')
export class AiController {
  constructor(
    private readonly jobs: AiJobsService,
    private readonly realtime: AiRealtimePublisher,
  ) {}

  @Get('usage')
  @ApiOperation({ summary: "Whether AI is available, and today's scan usage" })
  @ApiOkResponse({ schema: zodOpenApiSchema(aiUsageResponseSchema) })
  usage(@CurrentActor() actor: Actor): Promise<AiUsageResponse> {
    return this.jobs.usage(actor);
  }

  @Get('realtime')
  @ApiOperation({ summary: "Pusher settings and the caller's private AI progress channel" })
  @ApiOkResponse({ schema: zodOpenApiSchema(aiRealtimeConfigSchema) })
  realtimeConfig(@CurrentActor() actor: Actor): AiRealtimeConfig {
    return this.realtime.configuration(actor);
  }

  @Post('realtime/auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Authorize only the caller's own AI progress channel" })
  realtimeAuth(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(notificationChannelAuthRequestSchema))
    input: NotificationChannelAuthRequest,
  ): NotificationChannelAuthResponse {
    return this.realtime.authorize(actor, input);
  }

  @Post('menu-scans')
  @RequirePermissions(Permission.MENU_SCAN)
  @ApiOperation({
    summary: 'Start reading a paper menu from 1–8 photos',
    description:
      'Rows stream in on the AI channel and via GET /ai/jobs/:id. Counts toward the daily limit.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(scanBody)
  @ApiOkResponse({ schema: zodOpenApiSchema(aiJobDetailResponseSchema) })
  @ApiTooManyRequestsResponse({ schema: zodOpenApiSchema(aiQuotaErrorSchema) })
  @UseInterceptors(scanUpload)
  createMenuScan(
    @CurrentActor() actor: Actor,
    @UploadedFiles() files: UploadedPage[] | undefined,
    @Body(new ZodValidationPipe(createScanFieldsSchema)) fields: CreateScanFields,
  ): Promise<AiJobDetailResponse> {
    return this.jobs.createScan(actor, 'MENU_SCAN', files, fields);
  }

  @Post('menu-scans/:id/pages/:page')
  @RequirePermissions(Permission.MENU_SCAN)
  @ApiOperation({ summary: 'Retake one page of a menu scan and read it again' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(pageUpload)
  retakeMenuPage(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('page', ParseIntPipe) page: number,
    @UploadedFile() file: UploadedPage | undefined,
  ): Promise<AiJobDetailResponse> {
    return this.jobs.retakePage(actor, 'MENU_SCAN', id, page, file);
  }

  @Post('invoice-scans')
  @RequirePermissions(Permission.INVENTORY_SCAN_INVOICE)
  @ApiOperation({
    summary: 'Start reading a supplier invoice from 1–8 photos',
    description: 'Counts toward the daily invoice limit.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(scanBody)
  @ApiOkResponse({ schema: zodOpenApiSchema(aiJobDetailResponseSchema) })
  @ApiTooManyRequestsResponse({ schema: zodOpenApiSchema(aiQuotaErrorSchema) })
  @UseInterceptors(scanUpload)
  createInvoiceScan(
    @CurrentActor() actor: Actor,
    @UploadedFiles() files: UploadedPage[] | undefined,
    @Body(new ZodValidationPipe(createScanFieldsSchema)) fields: CreateScanFields,
  ): Promise<AiJobDetailResponse> {
    return this.jobs.createScan(actor, 'INVOICE_SCAN', files, fields);
  }

  @Post('invoice-scans/:id/pages/:page')
  @RequirePermissions(Permission.INVENTORY_SCAN_INVOICE)
  @ApiOperation({ summary: 'Retake one page of an invoice scan and read it again' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(pageUpload)
  retakeInvoicePage(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('page', ParseIntPipe) page: number,
    @UploadedFile() file: UploadedPage | undefined,
  ): Promise<AiJobDetailResponse> {
    return this.jobs.retakePage(actor, 'INVOICE_SCAN', id, page, file);
  }

  @Post('recipe-drafts')
  @RequirePermissions(Permission.MENU_WRITE)
  @ApiOperation({ summary: 'Draft recipes and food cost for a list of dishes' })
  @ApiBody({ schema: zodOpenApiSchema(createRecipeDraftRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(aiJobDetailResponseSchema) })
  createRecipeDraft(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createRecipeDraftRequestSchema)) input: CreateRecipeDraftRequest,
  ): Promise<AiJobDetailResponse> {
    return this.jobs.createRecipeDraft(actor, input);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'A job with its rows after `afterSeq` (resume after refresh)' })
  @ApiZodQuery(aiJobItemsQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(aiJobDetailResponseSchema) })
  detail(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(aiJobItemsQuerySchema)) query: AiJobItemsQuery,
  ): Promise<AiJobDetailResponse> {
    return this.jobs.detail(actor, id, query.afterSeq);
  }

  @Get('jobs/:id/pages/:page')
  @ApiOperation({ summary: 'One scanned photo (for the review screen), while it is kept' })
  async pageImage(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('page', ParseIntPipe) page: number,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.jobs.pageImage(actor, id, page);
    response
      .status(HttpStatus.OK)
      .set({ 'Content-Type': image.type, 'Cache-Control': 'private, max-age=3600' })
      .send(image.data);
  }

  @Post('jobs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stop a job; rows read so far are kept unless `purge` deletes photos too',
  })
  @ApiOkResponse({ schema: zodOpenApiSchema(aiJobDetailResponseSchema) })
  cancel(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelBodySchema)) input: z.infer<typeof cancelBodySchema>,
  ): Promise<AiJobDetailResponse> {
    return this.jobs.cancel(actor, id, input.purge ?? false);
  }

  @Post('jobs/:id/release')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Done with this scan: delete its photos from the server' })
  release(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.jobs.release(actor, id);
  }
}
