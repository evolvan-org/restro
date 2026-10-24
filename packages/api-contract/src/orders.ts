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
    sentQuantity: z
      .number()
      .int()
      .min(0)
      .describe('Units already on a KOT; the remainder (quantity - sentQuantity) is unsent'),
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

/**
 * Adding an item identical to an active line (same item, note and price snapshot) raises that
 * line's quantity, even if part of it was already sent; the next KOT carries only the unsent
 * remainder. Otherwise it creates a new line with its own price snapshot.
 */
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

export const kotDestinationSchema = z.enum(['KITCHEN', 'BAR']);
export const kotStatusSchema = z.enum(['PENDING', 'PREPARING', 'READY', 'COMPLETED']);

export const kotItemSchema = z
  .object({
    id: z.string().uuid(),
    orderItemId: z.string().uuid(),
    menuItemId: z.string().uuid(),
    name: z.string(),
    quantity: z.number().int().positive(),
    specialInstructions: z.string().nullable(),
    status: kotStatusSchema,
  })
  .strict();

export const kotSchema = z
  .object({
    id: z.string().uuid(),
    orderId: z.string().uuid(),
    kotNumber: z.string().regex(/^KOT-\d{6,}$/),
    destination: kotDestinationSchema,
    status: kotStatusSchema,
    createdAt: z.string().datetime(),
    items: z.array(kotItemSchema),
  })
  .strict();

export const fireOrderRequestSchema = z.object({}).strict();

export const fireOrderResponseSchema = z
  .object({
    kots: z.array(kotSchema).min(1).max(2),
    order: orderSchema,
  })
  .strict();

export type KotDestination = z.infer<typeof kotDestinationSchema>;
export type KotStatus = z.infer<typeof kotStatusSchema>;
export type KotItem = z.infer<typeof kotItemSchema>;
export type Kot = z.infer<typeof kotSchema>;
export type FireOrderRequest = z.infer<typeof fireOrderRequestSchema>;
export type FireOrderResponse = z.infer<typeof fireOrderResponseSchema>;
