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
  })
  .strict();

export const createOrderRequestSchema = z
  .object({
    tableId: z.string().uuid('Table id must be a UUID'),
    reservationId: z.string().uuid('Reservation id must be a UUID').optional(),
  })
  .strict();

export const currentOrderQuerySchema = z
  .object({ tableId: z.string().uuid('Table id must be a UUID') })
  .strict();

/** Preserve the standard error fields while allowing the client to resume the existing order. */
export const orderAlreadyOpenErrorSchema = errorResponseSchema
  .extend({ statusCode: z.literal(409), existingOrder: orderSchema })
  .strict();

export type Order = z.infer<typeof orderSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type CurrentOrderQuery = z.infer<typeof currentOrderQuerySchema>;
export type OrderAlreadyOpenError = z.infer<typeof orderAlreadyOpenErrorSchema>;
