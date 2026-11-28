import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiGoneResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  GUEST_SECRET_HEADER,
  type OkResponse,
  okResponseSchema,
  type QrAddCartItemRequest,
  qrAddCartItemRequestSchema,
  type QrChannelAuthRequest,
  qrChannelAuthRequestSchema,
  type QrChannelAuthResponse,
  qrChannelAuthResponseSchema,
  type QrFeedbackRequest,
  qrFeedbackRequestSchema,
  type QrJoinRequest,
  qrJoinRequestSchema,
  type QrJoinResponse,
  qrJoinResponseSchema,
  type QrMenuResponse,
  qrMenuResponseSchema,
  type QrRequestPaymentRequest,
  qrRequestPaymentRequestSchema,
  type QrResolveResponse,
  qrResolveResponseSchema,
  type QrSessionResponse,
  qrSessionResponseSchema,
  type QrSplitRequest,
  qrSplitRequestSchema,
  type QrSubmitRoundRequest,
  qrSubmitRoundRequestSchema,
  type QrUpdateCartItemRequest,
  qrUpdateCartItemRequestSchema,
} from '@rms/api-contract';
import type { Request } from 'express';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { QrFeedbackService } from './qr-feedback.service';
import { QrGuestService } from './qr-guest.service';
import { QrTokenPipe } from './qr-token.pipe';

const guestSecretHeader = ApiHeader({
  name: GUEST_SECRET_HEADER,
  required: true,
  description: 'Device secret returned by POST /qr/{token}/join',
});

/**
 * Public guest endpoints for QR table ordering. No staff auth: the tenant and table come from the
 * unguessable token alone, session endpoints need the device's guest secret, and every write is
 * rate-limited. Prices and totals are always computed on the server.
 */
@ApiTags('qr ordering (guest)')
@ApiNotFoundResponse(
  apiError('Unknown, malformed or rotated QR token ("This QR code isn’t working")'),
)
@ApiResponse({ status: 429, ...apiError('Too many requests') })
@Controller('qr/:token')
export class QrGuestController {
  constructor(
    private readonly service: QrGuestService,
    private readonly feedback: QrFeedbackService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Resolve a table QR: branding, table, current captain, ordering state' })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrResolveResponseSchema) })
  resolve(
    @Param('token', QrTokenPipe) token: string,
    @Req() request: Request,
  ): Promise<QrResolveResponse> {
    return this.service.resolve(token, clientIp(request));
  }

  @Post('feedback')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send anonymous feedback about this table visit' })
  @ApiBody({ schema: zodOpenApiSchema(qrFeedbackRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(okResponseSchema) })
  submitFeedback(
    @Param('token', QrTokenPipe) token: string,
    @Req() request: Request,
    @Body(new ZodValidationPipe(qrFeedbackRequestSchema)) input: QrFeedbackRequest,
  ): Promise<OkResponse> {
    return this.feedback.submit(token, clientIp(request), input);
  }

  @Get('menu')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "The restaurant's active menu for this table (sold-out items flagged)" })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrMenuResponseSchema) })
  menu(@Param('token', QrTokenPipe) token: string): Promise<QrMenuResponse> {
    return this.service.menu(token);
  }

  @Post('join')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Join the table with name and phone (both required); returns the device secret',
  })
  @ApiBody({ schema: zodOpenApiSchema(qrJoinRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrJoinResponseSchema) })
  @ApiConflictResponse(apiError('Ordering is not available at this table'))
  join(
    @Param('token', QrTokenPipe) token: string,
    @Body(new ZodValidationPipe(qrJoinRequestSchema)) input: QrJoinRequest,
    @Req() request: Request,
  ): Promise<QrJoinResponse> {
    return this.service.join(token, input, clientIp(request));
  }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  @guestSecretHeader
  @ApiOperation({ summary: 'Shared cart, rounds with live status, and the bill for this visit' })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSessionResponseSchema) })
  @ApiUnauthorizedResponse(apiError('Missing or unknown guest secret'))
  @ApiGoneResponse(apiError('The visit has ended'))
  session(
    @Param('token', QrTokenPipe) token: string,
    @Headers(GUEST_SECRET_HEADER) secret: string | undefined,
  ): Promise<QrSessionResponse> {
    return this.service.session(token, secret);
  }

  @Post('realtime/auth')
  @HttpCode(200)
  @guestSecretHeader
  @ApiOperation({ summary: "Authorize the guest's Pusher subscription to this visit's channel" })
  @ApiBody({ schema: zodOpenApiSchema(qrChannelAuthRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrChannelAuthResponseSchema) })
  authorize(
    @Param('token', QrTokenPipe) token: string,
    @Headers(GUEST_SECRET_HEADER) secret: string | undefined,
    @Body(new ZodValidationPipe(qrChannelAuthRequestSchema)) input: QrChannelAuthRequest,
  ): Promise<QrChannelAuthResponse> {
    return this.service.authorizeChannel(token, secret, input);
  }

  @Post('cart/items')
  @HttpCode(200)
  @guestSecretHeader
  @ApiOperation({ summary: 'Add a dish to the shared cart (merges with your same line)' })
  @ApiBody({ schema: zodOpenApiSchema(qrAddCartItemRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSessionResponseSchema) })
  addCartItem(
    @Param('token', QrTokenPipe) token: string,
    @Headers(GUEST_SECRET_HEADER) secret: string | undefined,
    @Body(new ZodValidationPipe(qrAddCartItemRequestSchema)) input: QrAddCartItemRequest,
  ): Promise<QrSessionResponse> {
    return this.service.addCartItem(token, secret, input);
  }

  @Patch('cart/items/:lineId')
  @guestSecretHeader
  @ApiOperation({ summary: 'Change a cart line quantity (0 removes it)' })
  @ApiBody({ schema: zodOpenApiSchema(qrUpdateCartItemRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSessionResponseSchema) })
  updateCartItem(
    @Param('token', QrTokenPipe) token: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Headers(GUEST_SECRET_HEADER) secret: string | undefined,
    @Body(new ZodValidationPipe(qrUpdateCartItemRequestSchema)) input: QrUpdateCartItemRequest,
  ): Promise<QrSessionResponse> {
    return this.service.updateCartItem(token, secret, lineId, input);
  }

  @Post('rounds')
  @HttpCode(200)
  @guestSecretHeader
  @ApiOperation({
    summary: "Send the cart as a new round to the table's captain (idempotent per key)",
  })
  @ApiBody({ schema: zodOpenApiSchema(qrSubmitRoundRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSessionResponseSchema) })
  @ApiConflictResponse(apiError('Ordering is off, or a dish has sold out'))
  submitRound(
    @Param('token', QrTokenPipe) token: string,
    @Headers(GUEST_SECRET_HEADER) secret: string | undefined,
    @Body(new ZodValidationPipe(qrSubmitRoundRequestSchema)) input: QrSubmitRoundRequest,
  ): Promise<QrSessionResponse> {
    return this.service.submitRound(token, secret, input);
  }

  @Post('rounds/:roundId/restore')
  @HttpCode(200)
  @guestSecretHeader
  @ApiOperation({ summary: "Put a rejected round's dishes back in the cart to edit and resend" })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSessionResponseSchema) })
  restore(
    @Param('token', QrTokenPipe) token: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Headers(GUEST_SECRET_HEADER) secret: string | undefined,
  ): Promise<QrSessionResponse> {
    return this.service.restoreRejectedRound(token, secret, roundId);
  }

  @Post('call-server')
  @HttpCode(200)
  @guestSecretHeader
  @ApiOperation({ summary: "Ask the table's captain to come over" })
  @ApiOkResponse({ schema: zodOpenApiSchema(okResponseSchema) })
  callServer(
    @Param('token', QrTokenPipe) token: string,
    @Headers(GUEST_SECRET_HEADER) secret: string | undefined,
  ): Promise<OkResponse> {
    return this.service.callServer(token, secret);
  }

  @Post('bill-request')
  @HttpCode(200)
  @guestSecretHeader
  @ApiOperation({ summary: 'Request the bill; the captain is notified' })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSessionResponseSchema) })
  requestBill(
    @Param('token', QrTokenPipe) token: string,
    @Headers(GUEST_SECRET_HEADER) secret: string | undefined,
  ): Promise<QrSessionResponse> {
    return this.service.requestBill(token, secret);
  }

  @Post('split')
  @HttpCode(200)
  @guestSecretHeader
  @ApiOperation({ summary: 'Split the bill: full, equally, by item or a custom amount' })
  @ApiBody({ schema: zodOpenApiSchema(qrSplitRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSessionResponseSchema) })
  split(
    @Param('token', QrTokenPipe) token: string,
    @Headers(GUEST_SECRET_HEADER) secret: string | undefined,
    @Body(new ZodValidationPipe(qrSplitRequestSchema)) input: QrSplitRequest,
  ): Promise<QrSessionResponse> {
    return this.service.split(token, secret, input);
  }

  @Post('shares/:shareId/pay')
  @HttpCode(200)
  @guestSecretHeader
  @ApiOperation({
    summary: 'Ask the captain to collect a share (UPI on the restaurant QR, cash or card)',
    description: 'Never marks the share paid: only staff can confirm a payment.',
  })
  @ApiBody({ schema: zodOpenApiSchema(qrRequestPaymentRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(qrSessionResponseSchema) })
  requestPayment(
    @Param('token', QrTokenPipe) token: string,
    @Param('shareId', ParseUUIDPipe) shareId: string,
    @Headers(GUEST_SECRET_HEADER) secret: string | undefined,
    @Body(new ZodValidationPipe(qrRequestPaymentRequestSchema)) input: QrRequestPaymentRequest,
  ): Promise<QrSessionResponse> {
    return this.service.requestPayment(token, secret, shareId, input);
  }
}

function clientIp(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}
