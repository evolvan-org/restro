import {
  Body,
  Controller,
  Delete,
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
  type AddOrderItemRequest,
  addOrderItemRequestSchema,
  type CompleteOrderResponse,
  completeOrderResponseSchema,
  type CreateOrderRequest,
  createOrderRequestSchema,
  type CurrentOrderQuery,
  currentOrderQuerySchema,
  type Order,
  orderAlreadyOpenErrorSchema,
  type OrderItem,
  type OrderItemMutationResponse,
  orderItemMutationResponseSchema,
  orderItemSchema,
  orderSchema,
  type UpdateOrderItemInstructionsRequest,
  updateOrderItemInstructionsRequestSchema,
  type UpdateOrderItemQuantityRequest,
  updateOrderItemQuantityRequestSchema,
} from '@rms/api-contract';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import { CurrentActor } from '../common/auth/current-actor.decorator';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { apiError, ApiZodQuery, zodOpenApiSchema } from '../common/swagger/zod-openapi';
import { OrderItemsService } from './order-items.service';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiUnauthorizedResponse(apiError('Authentication failed or the account is inactive'))
@ApiForbiddenResponse(apiError('Missing order permission'))
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly service: OrdersService,
    private readonly items: OrderItemsService,
  ) {}

  @Patch(':orderId/complete')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: 'Complete an order and mark its table as cleaning' })
  @ApiOkResponse({ schema: zodOpenApiSchema(completeOrderResponseSchema) })
  @ApiNotFoundResponse(apiError('Order not found in the caller restaurant'))
  @ApiConflictResponse(apiError('Only an open or submitted order can be completed'))
  complete(
    @CurrentActor() actor: Actor,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<CompleteOrderResponse> {
    return this.service.complete(actor, orderId);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ORDER_WRITE)
  @ApiOperation({
    summary: 'Open an order for an active reservation and mark its table occupied',
  })
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
  @Post(':orderId/items')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: 'Add a separate order line with the current menu price snapshot' })
  @ApiBody({ schema: zodOpenApiSchema(addOrderItemRequestSchema) })
  @ApiCreatedResponse({ schema: zodOpenApiSchema(orderItemMutationResponseSchema) })
  @ApiBadRequestResponse(apiError('Invalid input or unavailable menu item'))
  @ApiNotFoundResponse(apiError('Order or menu item not found in the caller restaurant'))
  @ApiConflictResponse(apiError('Order is not open'))
  addItem(
    @CurrentActor() actor: Actor,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(addOrderItemRequestSchema)) input: AddOrderItemRequest,
  ): Promise<OrderItemMutationResponse> {
    return this.items.add(actor, orderId, input);
  }

  @Delete(':orderId/items/:itemId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: 'Soft-cancel an unsent order line; repeated removal is a no-op' })
  @ApiOkResponse({ schema: zodOpenApiSchema(orderItemMutationResponseSchema) })
  @ApiBadRequestResponse(apiError('Invalid order or item id'))
  @ApiNotFoundResponse(apiError('Order or line not found in the caller restaurant'))
  @ApiConflictResponse(apiError('Order is not open or item has been sent to the kitchen'))
  removeItem(
    @CurrentActor() actor: Actor,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<OrderItemMutationResponse> {
    return this.items.remove(actor, orderId, itemId);
  }
  @Patch(':orderId/items/:itemId/quantity')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: 'Set the target quantity of an active, unsent order line' })
  @ApiBody({ schema: zodOpenApiSchema(updateOrderItemQuantityRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(orderItemSchema) })
  @ApiBadRequestResponse(apiError('Quantity must be a positive integer'))
  @ApiNotFoundResponse(apiError('Order or item not found in the caller restaurant'))
  @ApiConflictResponse(apiError('Order is not open, item is cancelled, or item has been sent'))
  updateQuantity(
    @CurrentActor() actor: Actor,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(updateOrderItemQuantityRequestSchema))
    input: UpdateOrderItemQuantityRequest,
  ): Promise<OrderItem> {
    return this.items.updateQuantity(actor, orderId, itemId, input);
  }

  @Patch(':orderId/items/:itemId/instructions')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: 'Set or clear instructions on an active, unsent order line' })
  @ApiBody({ schema: zodOpenApiSchema(updateOrderItemInstructionsRequestSchema) })
  @ApiOkResponse({ schema: zodOpenApiSchema(orderItemSchema) })
  @ApiBadRequestResponse(
    apiError('Instructions must be null or a string of at most 255 characters'),
  )
  @ApiNotFoundResponse(apiError('Order or item not found in the caller restaurant'))
  @ApiConflictResponse(apiError('Order is not open, item is cancelled, or item has been sent'))
  updateInstructions(
    @CurrentActor() actor: Actor,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(updateOrderItemInstructionsRequestSchema))
    input: UpdateOrderItemInstructionsRequest,
  ): Promise<OrderItem> {
    return this.items.updateInstructions(actor, orderId, itemId, input);
  }
}
