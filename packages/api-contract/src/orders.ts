import { z } from 'zod';

import { errorResponseSchema } from './common';
import { servingTypeSchema } from './serving-types';

export const orderStatusSchema = z.enum(['OPEN', 'SUBMITTED', 'COMPLETED', 'CANCELLED']);

export const orderItemSchema = z
  .object({
    id: z.string().uuid(),
    menuItemId: z.string().uuid(),
    name: z.string(),
    itemType: servingTypeSchema,
    quantity: z.number().int().positive(),
    isSentToKitchen: z.boolean(),
    lineTotal: z.string().describe('Quantity times snapshotted unit price, with 2 fraction digits'),
    unitPrice: z.string().describe('Price snapshot as a decimal string with 2 fraction digits'),
    specialInstructions: z.string().nullable(),
    status: z.enum(['ACTIVE', 'CANCELLED']),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const orderSchema = z
  .object({
    id: z.string().uuid(),
    tableId: z.string().uuid(),
    table: z.object({ id: z.string().uuid(), tableNumber: z.string() }).strict(),
    reservationId: z.string().uuid().nullable(),
    createdByUserId: z.string().uuid(),
    status: orderStatusSchema,
    notes: z.string().nullable(),
    openedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    items: z.array(orderItemSchema),
    total: z.string().describe('Sum of ACTIVE lines as a decimal string with 2 fraction digits'),
  })
  .strict();

export const createOrderRequestSchema = z
  .object({
    tableId: z.string().uuid('Table id must be a UUID'),
    reservationId: z.string().uuid('Select an active reservation'),
  })
  .strict();

export const currentOrderQuerySchema = z
  .object({ tableId: z.string().uuid('Table id must be a UUID') })
  .strict();

export const completeOrderResponseSchema = orderSchema;

/** Preserve the standard error fields while allowing the client to resume the existing order. */
export const orderAlreadyOpenErrorSchema = errorResponseSchema
  .extend({ statusCode: z.literal(409), existingOrder: orderSchema })
  .strict();

export type Order = z.infer<typeof orderSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type CurrentOrderQuery = z.infer<typeof currentOrderQuerySchema>;
export type CompleteOrderResponse = z.infer<typeof completeOrderResponseSchema>;
export type OrderAlreadyOpenError = z.infer<typeof orderAlreadyOpenErrorSchema>;

/** Repeated additions always create separate lines, each with its own price snapshot. */
export const addOrderItemRequestSchema = z
  .object({
    menuItemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(2147483647),
    specialInstructions: z.string().max(255).optional(),
  })
  .strict();

export const orderItemMutationResponseSchema = z
  .object({
    item: orderItemSchema,
    order: orderSchema,
  })
  .strict();

export type AddOrderItemRequest = z.infer<typeof addOrderItemRequestSchema>;
export type OrderItemMutationResponse = z.infer<typeof orderItemMutationResponseSchema>;

export const updateOrderItemQuantityRequestSchema = addOrderItemRequestSchema.pick({
  quantity: true,
});

export const updateOrderItemInstructionsRequestSchema = z
  .object({
    specialInstructions: z
      .string()
      .trim()
      .max(255)
      .nullable()
      .transform((value) => value || null),
  })
  .strict();

export type UpdateOrderItemQuantityRequest = z.infer<typeof updateOrderItemQuantityRequestSchema>;
export type UpdateOrderItemInstructionsRequest = z.infer<
  typeof updateOrderItemInstructionsRequestSchema
>;
