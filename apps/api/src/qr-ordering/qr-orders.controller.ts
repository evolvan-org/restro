import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type OkResponse,
  okResponseSchema,
  type QrAlertsResponse,
  qrAlertsResponseSchema,
  type QrApproveRoundRequest,
  qrApproveRoundRequestSchema,
  type QrAssignCaptainRequest,
  qrAssignCaptainRequestSchema,
  type QrAssignCaptainResponse,
  qrAssignCaptainResponseSchema,
  type QrCaptainOptionsQuery,
  qrCaptainOptionsQuerySchema,
  type QrCaptainOptionsResponse,
  qrCaptainOptionsResponseSchema,
  type QrChannelAuthRequest,
  qrChannelAuthRequestSchema,
  type QrChannelAuthResponse,
  qrChannelAuthResponseSchema,
  type QrCollectAtTableRequest,
  qrCollectAtTableRequestSchema,
  type QrFloorResponse,
  qrFloorResponseSchema,
  type QrQueueQuery,
  qrQueueQuerySchema,
  type QrQueueResponse,
  qrQueueResponseSchema,
  type QrRealtimeConfig,
  qrRealtimeConfigSchema,
  type QrRecordSharePaymentRequest,
  qrRecordSharePaymentRequestSchema,
  type QrRejectRoundRequest,
  qrRejectRoundRequestSchema,
  type QrRoundDetail,
  qrRoundDetailSchema,
  type QrSettings,
  qrSettingsSchema,
  type QrStaffBill,
  qrStaffBillSchema,
  type QrSummaryResponse,
  qrSummaryResponseSchema,
  type QrTableCard,
  qrTableCardSchema,
  type QrTableCardsResponse,
  qrTableCardsResponseSchema,
  type UpdateQrSettingsRequest,
  updateQrSettingsRequestSchema,
  type UploadUpiQrRequest,
  uploadUpiQrRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import type { Response } from 'express';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { QrSettingsService } from './qr-settings.service';
import { QrStaffService } from './qr-staff.service';

/**
 * Staff side of QR ordering: the captain approval queue, manager escalation and assignment, QR
 * payments, settings and table cards. Visibility (`qr-order:read`) is separate from acting:
 * a round can be approved only by its owner captain (`qr-order:approve`) or a manager
 * (`qr-order:manage`), enforced in the service.
 */
@ApiTags('qr ordering (staff)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing the permission required by this route'))
@Controller('qr-orders')
export class QrOrdersController {
  constructor(
    private readonly service: QrStaffService,
    private readonly settings: QrSettingsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.QR_ORDER_READ)
  @ApiOperation({ summary: 'QR orders queue: awaiting, sent to kitchen, bill requested, rejected' })
  @ApiZodQuery(qrQueueQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(qrQueueResponseSchema) })
  queue(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(qrQueueQuerySchema)) query: QrQueueQuery,
  ): Promise<QrQueueResponse> {
    return this.service.queue(actor, query);
  }

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.QR_ORDER_READ)
  @ApiOperation({ summary: 'Nav badge and persistent strip: my waiting rounds, open alerts' })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSummaryResponseSchema) })
  summary(@CurrentActor() actor: Actor): Promise<QrSummaryResponse> {
    return this.service.summary(actor);
  }

  @Get('floor')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.FLOOR_READ)
  @ApiOperation({ summary: 'Floor board markers: pending QR orders, bill requests, no captain' })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrFloorResponseSchema) })
  floor(@CurrentActor() actor: Actor): Promise<QrFloorResponse> {
    return this.service.floor(actor);
  }

  @Get('realtime')
  @ApiOperation({ summary: "Pusher settings and the restaurant's staff QR channel" })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrRealtimeConfigSchema) })
  realtime(@CurrentActor() actor: Actor): QrRealtimeConfig {
    return this.service.realtimeConfig(actor);
  }

  @Post('realtime/auth')
  @HttpCode(200)
  @ApiOperation({ summary: 'Authorize a Pusher subscription to the staff QR channel' })
  @ApiBody({ schema: zodOpenApiSchema(qrChannelAuthRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrChannelAuthResponseSchema) })
  authorize(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(qrChannelAuthRequestSchema)) input: QrChannelAuthRequest,
  ): QrChannelAuthResponse {
    return this.service.authorizeChannel(actor, input);
  }

  @Get('rounds/:id')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.QR_ORDER_READ)
  @ApiOperation({ summary: 'One guest round for review' })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrRoundDetailSchema) })
  @ApiNotFoundResponse(apiError('Round not found in the caller restaurant'))
  round(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QrRoundDetail> {
    return this.service.round(actor, id);
  }

  @Post('rounds/:id/approve')
  @HttpCode(200)
  @RequirePermissions(Permission.QR_ORDER_APPROVE)
  @ApiOperation({
    summary: 'Approve (optionally with edits) and send to the kitchen and bar',
    description: 'Creates order lines and KOTs split by Kitchen/Bar, tagged "QR · approved by".',
  })
  @ApiBody({ schema: zodOpenApiSchema(qrApproveRoundRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrRoundDetailSchema) })
  @ApiConflictResponse(apiError('Already approved or rejected'))
  approve(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(qrApproveRoundRequestSchema)) input: QrApproveRoundRequest,
  ): Promise<QrRoundDetail> {
    return this.service.approve(actor, id, input);
  }

  @Post('rounds/:id/reject')
  @HttpCode(200)
  @RequirePermissions(Permission.QR_ORDER_APPROVE)
  @ApiOperation({ summary: 'Reject with a reason the guest reads; nothing reaches the kitchen' })
  @ApiBody({ schema: zodOpenApiSchema(qrRejectRoundRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrRoundDetailSchema) })
  reject(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(qrRejectRoundRequestSchema)) input: QrRejectRoundRequest,
  ): Promise<QrRoundDetail> {
    return this.service.reject(actor, id, input);
  }

  @Post('rounds/:id/on-my-way')
  @HttpCode(200)
  @RequirePermissions(Permission.QR_ORDER_APPROVE)
  @ApiOperation({ summary: '"I’m on my way": stops the escalation timer' })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrRoundDetailSchema) })
  onMyWay(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QrRoundDetail> {
    return this.service.onMyWay(actor, id);
  }

  @Get('sessions/:id/bill')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.QR_ORDER_READ)
  @ApiOperation({ summary: "A QR table's bill with per-share paid/unpaid status" })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrStaffBillSchema) })
  bill(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<QrStaffBill> {
    return this.service.bill(actor, id);
  }

  @Post('sessions/:id/collect')
  @HttpCode(200)
  @RequirePermissions(Permission.QR_ORDER_APPROVE, Permission.PAYMENT_WRITE)
  @ApiOperation({ summary: 'Record a payment collected at the table (no guest share)' })
  @ApiBody({ schema: zodOpenApiSchema(qrCollectAtTableRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrStaffBillSchema) })
  @ApiConflictResponse(apiError('Already settled, or the bill could not be closed'))
  collect(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(qrCollectAtTableRequestSchema)) input: QrCollectAtTableRequest,
  ): Promise<QrStaffBill> {
    return this.service.collectAtTable(actor, id, input);
  }

  @Post('shares/:id/payment')
  @HttpCode(200)
  @RequirePermissions(Permission.QR_ORDER_APPROVE, Permission.PAYMENT_WRITE)
  @ApiOperation({
    summary: 'Confirm a share payment the staff member has verified',
    description:
      'UPI is checked by the captain against the restaurant QR; when paid shares cover the total the bill is settled and the table goes to cleaning.',
  })
  @ApiBody({ schema: zodOpenApiSchema(qrRecordSharePaymentRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrStaffBillSchema) })
  recordPayment(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(qrRecordSharePaymentRequestSchema))
    input: QrRecordSharePaymentRequest,
  ): Promise<QrStaffBill> {
    return this.service.recordSharePayment(actor, id, input);
  }

  @Get('upi-qr')
  @RequirePermissions(Permission.QR_ORDER_READ)
  @ApiOperation({ summary: "The restaurant's uploaded UPI QR image, shown to the paying guest" })
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  @ApiNotFoundResponse(apiError('No UPI QR uploaded'))
  async upiQr(@CurrentActor() actor: Actor, @Res() response: Response): Promise<void> {
    const image = await this.settings.upiQr(actor);
    response
      .status(200)
      .setHeader('Content-Type', image.mimeType)
      .setHeader('Cache-Control', 'private, no-store')
      .setHeader('X-Content-Type-Options', 'nosniff')
      .send(image.data);
  }

  @Get('captains')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.QR_ORDER_MANAGE)
  @ApiOperation({ summary: 'Assignable captains with load (active tables, pending orders)' })
  @ApiZodQuery(qrCaptainOptionsQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(qrCaptainOptionsResponseSchema) })
  captains(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(qrCaptainOptionsQuerySchema)) query: QrCaptainOptionsQuery,
  ): Promise<QrCaptainOptionsResponse> {
    return this.service.captainOptions(actor, query.tableId);
  }

  @Post('tables/:id/captain')
  @HttpCode(200)
  @RequirePermissions(Permission.QR_ORDER_MANAGE)
  @ApiOperation({
    summary: 'Assign or reassign a table’s captain, optionally moving waiting orders',
    description:
      'Applies to future orders immediately; the guest phone shows the new server. Moving a waiting order restarts its escalation timer for the new captain.',
  })
  @ApiBody({ schema: zodOpenApiSchema(qrAssignCaptainRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrAssignCaptainResponseSchema) })
  @ApiBadRequestResponse(apiError('The user is inactive or not eligible to be a captain'))
  assignCaptain(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(qrAssignCaptainRequestSchema)) input: QrAssignCaptainRequest,
  ): Promise<QrAssignCaptainResponse> {
    return this.service.assignCaptain(actor, id, input);
  }

  @Get('alerts')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.QR_ORDER_MANAGE)
  @ApiOperation({ summary: 'Manager alerts: escalations and no-captain scans' })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrAlertsResponseSchema) })
  alerts(@CurrentActor() actor: Actor): Promise<QrAlertsResponse> {
    return this.service.alerts(actor);
  }

  @Post('alerts/:id/dismiss')
  @HttpCode(200)
  @RequirePermissions(Permission.QR_ORDER_MANAGE)
  @ApiOperation({ summary: 'Dismiss an open alert' })
  @ApiOkResponse({ schema: zodOpenApiSchema(okResponseSchema) })
  dismiss(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OkResponse> {
    return this.service.dismissAlert(actor, id);
  }

  @Get('settings')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.SETTINGS_READ)
  @ApiOperation({ summary: 'QR ordering settings' })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSettingsSchema) })
  getSettings(@CurrentActor() actor: Actor): Promise<QrSettings> {
    return this.settings.get(actor);
  }

  @Put('settings')
  @RequirePermissions(Permission.QR_SETTINGS_WRITE)
  @ApiOperation({ summary: 'Update QR ordering settings' })
  @ApiBody({ schema: zodOpenApiSchema(updateQrSettingsRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSettingsSchema) })
  @ApiBadRequestResponse(apiError('Invalid timeout, phone or a brand colour below 4.5:1'))
  updateSettings(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(updateQrSettingsRequestSchema)) input: UpdateQrSettingsRequest,
  ): Promise<QrSettings> {
    return this.settings.update(actor, input);
  }

  @Put('settings/upi-qr')
  @RequirePermissions(Permission.QR_SETTINGS_WRITE)
  @ApiOperation({ summary: "Upload the restaurant's UPI QR image (PNG/JPEG/WebP, ≤ 1 MB)" })
  @ApiBody({ schema: zodOpenApiSchema(uploadUpiQrRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSettingsSchema) })
  uploadUpiQr(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(uploadUpiQrRequestSchema)) input: UploadUpiQrRequest,
  ): Promise<QrSettings> {
    return this.settings.uploadUpiQr(actor, input);
  }

  @Delete('settings/upi-qr')
  @RequirePermissions(Permission.QR_SETTINGS_WRITE)
  @ApiOperation({ summary: 'Remove the uploaded UPI QR image' })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSettingsSchema) })
  deleteUpiQr(@CurrentActor() actor: Actor): Promise<QrSettings> {
    return this.settings.deleteUpiQr(actor);
  }

  @Get('cards')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.QR_SETTINGS_WRITE)
  @ApiOperation({ summary: 'QR table cards: brand, table number and token per table' })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrTableCardsResponseSchema) })
  cards(@CurrentActor() actor: Actor): Promise<QrTableCardsResponse> {
    return this.settings.cards(actor);
  }

  @Post('tables/:id/rotate-token')
  @HttpCode(200)
  @RequirePermissions(Permission.QR_SETTINGS_WRITE)
  @ApiOperation({ summary: 'Regenerate a table’s QR token; the old card stops working' })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrTableCardSchema) })
  rotateToken(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QrTableCard> {
    return this.settings.rotateToken(actor, id);
  }
}
