import {
  Body,
  Controller,
  Get,
  Header,
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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type Bill,
  type BillCancellationReasonsResponse,
  billCancellationReasonsResponseSchema,
  type BillInvoice,
  billInvoiceSchema,
  type BillListQuery,
  billListQuerySchema,
  type BillListResponse,
  billListResponseSchema,
  billSchema,
  type CancelBillRequest,
  cancelBillRequestSchema,
  type GenerateBillRequest,
  generateBillRequestSchema,
  type UpdateBillRequest,
  updateBillRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { BillsService } from './bills.service';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.BILL_READ)
@ApiUnauthorizedResponse(apiError('Authentication required'))
@ApiForbiddenResponse(apiError('Missing billing permission'))
@ApiNotFoundResponse(apiError('Bill or order not found in the caller restaurant'))
@ApiBadRequestResponse(apiError('Invalid identifiers, input, discount or amounts'))
@ApiConflictResponse(apiError('Invalid bill/order status, or invoice requires resync'))
@Controller()
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Post('orders/:orderId/bill')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.BILL_GENERATE)
  @ApiOperation({
    summary: 'Generate or reopen a submitted order bill; existing open bills are unchanged',
  })
  @ApiBody({ schema: zodOpenApiSchema(generateBillRequestSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(billSchema) })
  generate(
    @CurrentActor() actor: Actor,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(generateBillRequestSchema)) _input: GenerateBillRequest,
  ): Promise<Bill> {
    return this.bills.generate(actor, orderId);
  }

  @Get('orders/:orderId/bill')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get the bill for an order' })
  @ApiOkResponse({ schema: zodOpenApiSchema(billSchema) })
  byOrder(
    @CurrentActor() actor: Actor,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<Bill> {
    return this.bills.get(actor, { orderId });
  }

  @Get('bills')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List restaurant bills, optionally filtered by status' })
  @ApiZodQuery(billListQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(billListResponseSchema) })
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(billListQuerySchema)) query: BillListQuery,
  ): Promise<BillListResponse> {
    return this.bills.list(actor, query);
  }

  @Get('bills/cancellation-reasons')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.BILL_CANCEL)
  @ApiOperation({ summary: 'List active bill cancellation options for the caller restaurant' })
  @ApiOkResponse({ schema: zodOpenApiSchema(billCancellationReasonsResponseSchema) })
  cancellationReasons(@CurrentActor() actor: Actor): Promise<BillCancellationReasonsResponse> {
    return this.bills.cancellationReasons(actor);
  }

  @Get('bills/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read a bill and current order lines' })
  @ApiOkResponse({ schema: zodOpenApiSchema(billSchema) })
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string): Promise<Bill> {
    return this.bills.get(actor, { id });
  }

  @Patch('bills/:id')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.BILL_UPDATE)
  @ApiOperation({ summary: 'Edit an open bill; a discount additionally requires bill:discount' })
  @ApiBody({ schema: zodOpenApiSchema(updateBillRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(billSchema) })
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBillRequestSchema)) input: UpdateBillRequest,
  ): Promise<Bill> {
    return this.bills.update(actor, id, input);
  }

  @Patch('bills/:id/cancel')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.BILL_CANCEL)
  @ApiOperation({ summary: 'Cancel an open bill without changing the order or table' })
  @ApiBody({ schema: zodOpenApiSchema(cancelBillRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(billSchema) })
  cancel(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelBillRequestSchema)) input: CancelBillRequest,
  ): Promise<Bill> {
    return this.bills.cancel(actor, id, input);
  }

  @Get('bills/:id/invoice')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Compose an open proforma or paid final invoice without writes' })
  @ApiOkResponse({ schema: zodOpenApiSchema(billInvoiceSchema) })
  invoice(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillInvoice> {
    return this.bills.invoice(actor, id);
  }
}
