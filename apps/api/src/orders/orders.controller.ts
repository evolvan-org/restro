import { Body, Controller, Get, Header, Post, Query, UseGuards } from '@nestjs/common';
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
  type CreateOrderRequest,
  createOrderRequestSchema,
  type CurrentOrderQuery,
  currentOrderQuerySchema,
  type Order,
  orderAlreadyOpenErrorSchema,
  orderSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing order permission'))
@Controller('orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ORDER_WRITE)
  @ApiOperation({ summary: 'Open an order for a table without changing its table status' })
  @ApiBody({ schema: zodOpenApiSchema(createOrderRequestSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(orderSchema) })
  @ApiConflictResponse({
    description: 'An open order exists; resume existingOrder from this error envelope',
    schema: zodOpenApiSchema(orderAlreadyOpenErrorSchema),
  })
  @ApiBadRequestResponse(apiError('Invalid input, inactive table, or unsuitable reservation'))
  @ApiNotFoundResponse(apiError('Table or reservation not found in the caller restaurant'))
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(createOrderRequestSchema)) input: CreateOrderRequest,
  ): Promise<Order> {
    return this.service.create(actor, input);
  }

  @Get('current')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ORDER_READ)
  @ApiOperation({ summary: 'Get the current open order for a table, including its items' })
  @ApiZodQuery(currentOrderQuerySchema)
  @ApiOkResponse({ schema: zodOpenApiSchema(orderSchema) })
  @ApiBadRequestResponse(apiError('Invalid table id'))
  @ApiNotFoundResponse(apiError('No open order for this table in the caller restaurant'))
  current(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(currentOrderQuerySchema)) query: CurrentOrderQuery,
  ): Promise<Order> {
    return this.service.current(actor, query.tableId);
  }
}
