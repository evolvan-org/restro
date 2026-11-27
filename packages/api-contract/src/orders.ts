import { z } from 'zod';

import {
  dateOnlySchema,
  errorResponseSchema,
  paginatedResponseSchema,
  paginationQuerySchema,
} from './common';
import { servingTypeSchema } from './serving-types';
import { kotStatusSchema, preparationSchema } from './preparation';
import { orderSelectionSnapshotSchema } from './order-selections';

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
    selections: orderSelectionSnapshotSchema.nullable().optional(),
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
    readyToServe: z
      .boolean()
      .describe('True when at least one KOT exists and all KOTs are COMPLETED; derived read only'),
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
    variantId: z.string().uuid().optional(),
    modifierIds: z
      .array(z.string().uuid())
      .max(400)
      .refine((ids) => new Set(ids).size === ids.length, 'Select each option only once')
      .optional(),
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
export { kotStatusSchema } from './preparation';

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
    preparation: preparationSchema.optional(),
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

/** The statuses a station screen works: everything not yet COMPLETED. */
export const ACTIVE_KOT_STATUSES = ['PENDING', 'PREPARING', 'READY'] as const satisfies KotStatus[];

export const kotQueueItemSchema = kotSchema.extend({
  table: z
    .object({
      id: z.string().uuid(),
      tableNumber: z.string(),
      section: z.object({ id: z.string().uuid(), name: z.string() }).strict(),
    })
    .strict(),
  /** Present on tickets from an approved guest QR round: "QR · approved by <name>". */
  qr: z
    .object({
      approvedBy: z.string(),
      /** When the chef's Ready reached the guest's tracker. */
      guestNotifiedAt: z.string().datetime().nullable(),
    })
    .strict()
    .nullable()
    .default(null),
});

/** A complete active station snapshot, without pagination. */
export const kotBoardQuerySchema = z.object({ destination: kotDestinationSchema }).strict();
export const kotBoardResponseSchema = z.object({ data: z.array(kotQueueItemSchema) }).strict();
export type KotBoardQuery = z.infer<typeof kotBoardQuerySchema>;
export type KotBoardResponse = z.infer<typeof kotBoardResponseSchema>;

export const kotQueueQuerySchema = paginationQuerySchema
  .extend({
    destination: kotDestinationSchema,
    status: z
      .union([kotStatusSchema, z.array(kotStatusSchema).min(1)])
      .optional()
      .transform((value) =>
        value === undefined ? ACTIVE_KOT_STATUSES : typeof value === 'string' ? [value] : value,
      ),
  })
  .strict();

export const kotQueueResponseSchema = paginatedResponseSchema(kotQueueItemSchema);

export type KotQueueItem = z.infer<typeof kotQueueItemSchema>;
export type KotQueueQuery = z.infer<typeof kotQueueQuerySchema>;
export type KotQueueResponse = z.infer<typeof kotQueueResponseSchema>;

/** Ticket-level lifecycle: each status may only move to the next one (no skipping, no undo). */
export const KOT_STATUS_TRANSITIONS: Record<KotStatus, readonly KotStatus[]> = {
  PENDING: ['PREPARING'],
  PREPARING: ['READY'],
  READY: ['COMPLETED'],
  COMPLETED: [],
};

export const updateKotStatusRequestSchema = z
  .object({
    expectedStatus: kotStatusSchema.describe(
      'Current status observed by the caller; stale writes return 409',
    ),
    status: z.enum(['PREPARING', 'READY', 'COMPLETED']),
  })
  .strict();

export const updateKotStatusResponseSchema = kotQueueItemSchema;

export type UpdateKotStatusRequest = z.infer<typeof updateKotStatusRequestSchema>;
export type UpdateKotStatusResponse = z.infer<typeof updateKotStatusResponseSchema>;

// The board uses the same transition contract as the status API.
export const transitionKotStatusRequestSchema = updateKotStatusRequestSchema;
export type TransitionKotStatusRequest = UpdateKotStatusRequest;

/**
 * Captain dashboard: orders on the tables the caller is the assigned captain of. `open` is every
 * OPEN/SUBMITTED order; `closed` is today's (restaurant-local) COMPLETED orders.
 */
export const captainOrderViewSchema = z.enum(['open', 'closed']);

export const captainOrderListQuerySchema = z
  .object({ view: captainOrderViewSchema.default('open') })
  .strict();

export const captainOrderSummarySchema = z
  .object({
    id: z.string().uuid(),
    table: z.object({ id: z.string().uuid(), tableNumber: z.string() }).strict(),
    status: orderStatusSchema,
    bill: z
      .object({
        billNumber: z.string(),
        status: z.enum(['OPEN', 'PAID', 'CANCELLED']),
      })
      .strict()
      .nullable(),
    itemCount: z.number().int().nonnegative().describe('Units across ACTIVE lines'),
    itemNames: z.array(z.string()).describe('Distinct ACTIVE item names, in the order added'),
    kotCounts: z
      .object({
        pending: z.number().int().nonnegative(),
        preparing: z.number().int().nonnegative(),
        ready: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
      })
      .strict(),
    openedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    total: z
      .string()
      .describe('Paid bill total when settled, otherwise the sum of ACTIVE lines (2 decimals)'),
  })
  .strict();

export const captainOrderListResponseSchema = z
  .object({
    data: z.array(captainOrderSummarySchema),
    openCount: z.number().int().nonnegative(),
    closedCount: z.number().int().nonnegative(),
    currency: z.string().min(1),
  })
  .strict();

export type CaptainOrderView = z.infer<typeof captainOrderViewSchema>;
export type CaptainOrderListQuery = z.infer<typeof captainOrderListQuerySchema>;
export type CaptainOrderSummary = z.infer<typeof captainOrderSummarySchema>;
export type CaptainOrderListResponse = z.infer<typeof captainOrderListResponseSchema>;

/**
 * Orders page: every order (owner / `table:assign-captain`) or only orders on the caller's own
 * tables (`table:be-captain`). The server decides the scope; a captain's `captainId` is ignored.
 */
export const orderListQueryParamsSchema = paginationQuerySchema
  .extend({
    status: orderStatusSchema.optional(),
    from: dateOnlySchema
      .optional()
      .describe('Inclusive restaurant-local start date (YYYY-MM-DD) on openedAt'),
    to: dateOnlySchema
      .optional()
      .describe('Inclusive restaurant-local end date (YYYY-MM-DD) on openedAt'),
    captainId: z
      .string()
      .uuid()
      .optional()
      .describe('Current table captain; ignored for callers scoped to their own tables'),
    tableNumber: z.string().trim().min(1).max(20).optional().describe('Partial table number'),
  })
  .strict();

export const orderListQuerySchema = orderListQueryParamsSchema.superRefine(
  ({ from, to }, context) => {
    if (from !== undefined && to !== undefined && from > to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'End date must be on or after the start date',
      });
    }
  },
);

export const orderListItemSchema = captainOrderSummarySchema
  .extend({
    captain: z
      .object({ id: z.string().uuid(), name: z.string() })
      .strict()
      .nullable()
      .describe("The table's current captain"),
  })
  .strict();

export const orderListResponseSchema = paginatedResponseSchema(orderListItemSchema).extend({
  currency: z.string().min(1),
  timezone: z.string().min(1),
});

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type OrderListItem = z.infer<typeof orderListItemSchema>;
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;
