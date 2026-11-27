import { z } from 'zod';

import { billSummarySchema } from './bill-summary';
import { paginatedResponseSchema, paginationQuerySchema } from './common';
import { tableStatusCodeSchema } from './table-statuses';

const tableNumberSchema = z
  .string()
  .trim()
  .min(1, 'Table number is required')
  .max(50, 'Table number must be 50 characters or fewer');

const activeStateQuerySchema = z.preprocess((value) => {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return value;
}, z.boolean().optional());

const optionalUuidSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().uuid('Select a status').optional(),
);

const optionalCaptainIdSchema = z.preprocess(
  (value) => (value === '' ? null : value),
  z.string().uuid('Captain id must be a valid UUID').nullable().optional(),
);

export const tableSectionSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
  })
  .strict();

export const tableStatusSummarySchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().min(1),
    name: z.string().min(1),
  })
  .strict();

export const tableCaptainSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    role: z.string(),
  })
  .strict();

export const tableActiveReservationSchema = z
  .object({
    id: z.string().uuid(),
    reservationAt: z.string().datetime(),
    partySize: z.number().int(),
    status: z.enum(['BOOKED', 'SEATED']),
    notes: z.string().nullable(),
    guest: z
      .object({
        id: z.string().uuid(),
        guestName: z.string(),
        phoneNumber: z.string(),
      })
      .strict(),
  })
  .strict();

// Includes every restaurant-defined status code, not only the seeded defaults.
export const tableLifecycleStatusCodeSchema = tableStatusCodeSchema;

export const tableLifecycleStatusSchema = z
  .object({
    code: tableLifecycleStatusCodeSchema,
    name: z.string().min(1),
    sortOrder: z.number().int(),
  })
  .strict();

export const tableLifecycleStatusListResponseSchema = z.array(tableLifecycleStatusSchema);

export const transitionTableStatusRequestSchema = z
  .object({
    statusCode: tableLifecycleStatusCodeSchema,
  })
  .strict();

export const restaurantTableSchema = z
  .object({
    id: z.string().uuid(),
    tableNumber: z.string(),
    capacity: z.number().int(),
    isActive: z.boolean(),
    section: tableSectionSchema,
    currentStatus: tableStatusSummarySchema,
    captainUserId: z.string().uuid().nullable(),
    captain: tableCaptainSchema.nullable(),
    // UTC timestamp used by the floor-board elapsed timer.
    statusChangedAt: z.string().datetime(),
    activeReservation: tableActiveReservationSchema.nullable(),
    billSummary: billSummarySchema.nullable(),
    openOrderId: z.string().uuid().nullable(),
    readyKotCount: z
      .number()
      .int()
      .nonnegative()
      .describe('READY tickets across current active orders'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const tableListQuerySchema = paginationQuerySchema.extend({
  search: z
    .string()
    .trim()
    .max(50, 'Search must be 50 characters or fewer')
    .optional()
    .describe('Case-insensitive match on table number'),
  sectionId: z.string().uuid().optional(),
  statusId: z.string().uuid().optional(),
  isActive: activeStateQuerySchema,
});

const tableDetailsSchema = z
  .object({
    tableNumber: tableNumberSchema,
    capacity: z
      .number()
      .int()
      .positive('Capacity must be greater than zero')
      .max(100, 'Capacity must not exceed 100'),
    sectionId: z.string().uuid('Select a section'),
    currentStatusId: optionalUuidSchema,
    captainUserId: optionalCaptainIdSchema.describe(
      'Optional captain responsible for the table; null clears it.',
    ),
  })
  .strict();

export const createTableRequestSchema = tableDetailsSchema;

export const updateTableRequestSchema = tableDetailsSchema
  .omit({ currentStatusId: true })
  .partial()
  .refine(
    ({ tableNumber, capacity, sectionId, captainUserId }) =>
      tableNumber !== undefined ||
      capacity !== undefined ||
      sectionId !== undefined ||
      captainUserId !== undefined,
    { message: 'At least one field must be provided for update' },
  );

export const updateTableActiveRequestSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const assignTableCaptainRequestSchema = z
  .object({
    captainUserId: z.string().uuid('Captain id must be a valid UUID').nullable(),
  })
  .strict()
  .describe('Assign or change a table captain; null clears the assignment.');

export const assignTableCaptainResponseSchema = restaurantTableSchema;
export const captainOptionsResponseSchema = z.array(tableCaptainSchema);

/** Upper bound on tables in one bulk captain request (the whole floor of a large restaurant). */
export const MAX_BULK_CAPTAIN_TABLES = 200;

export const assignTablesCaptainRequestSchema = z
  .object({
    assignments: z
      .array(
        z
          .object({
            captainUserId: z
              .string()
              .uuid('Captain id must be a valid UUID')
              .nullable()
              .describe('Target captain; null clears the assignment.'),
            tables: z
              .array(
                z
                  .object({
                    tableId: z.string().uuid('Table id must be a valid UUID'),
                    expectedCaptainUserId: z
                      .string()
                      .uuid('Captain id must be a valid UUID')
                      .nullable()
                      .describe(
                        'The captain the client saw; the table is skipped as a conflict when it differs.',
                      ),
                  })
                  .strict(),
              )
              .min(1, 'Select at least one table'),
          })
          .strict(),
      )
      .min(1, 'Provide at least one assignment'),
  })
  .strict()
  .superRefine(({ assignments }, ctx) => {
    const tableIds = assignments.flatMap((assignment) => assignment.tables.map((t) => t.tableId));
    if (tableIds.length > MAX_BULK_CAPTAIN_TABLES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignments'],
        message: `Assign at most ${MAX_BULK_CAPTAIN_TABLES} tables at once`,
      });
    }
    if (new Set(tableIds).size !== tableIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignments'],
        message: 'Each table may appear only once',
      });
    }
  })
  .describe(
    'Assign, change or clear captains on many tables at once. Tables whose current captain differs from expectedCaptainUserId are left unchanged and returned as conflicts.',
  );

export const assignTablesCaptainResponseSchema = z
  .object({
    updated: z.array(restaurantTableSchema).describe('Tables that were changed, as they are now'),
    conflicts: z
      .array(restaurantTableSchema)
      .describe('Tables skipped because someone else changed their captain, as they are now'),
  })
  .strict();

export const tableListResponseSchema = paginatedResponseSchema(restaurantTableSchema);
/** The floor board needs every active table for local filters and complete counts. */
export const tableBoardQuerySchema = z.object({}).strict();
export const tableBoardResponseSchema = z.object({ data: z.array(restaurantTableSchema) }).strict();
export const tableOptionsResponseSchema = z
  .object({
    sections: z.array(tableSectionSchema),
    statuses: z.array(tableStatusSummarySchema),
  })
  .strict();
export const createTableResponseSchema = restaurantTableSchema;
export const updateTableResponseSchema = restaurantTableSchema;
export const updateTableActiveResponseSchema = restaurantTableSchema;
export const transitionTableStatusResponseSchema = restaurantTableSchema;

export type TableSection = z.infer<typeof tableSectionSchema>;
export type TableStatusSummary = z.infer<typeof tableStatusSummarySchema>;
export type TableCaptain = z.infer<typeof tableCaptainSchema>;
export type TableActiveReservation = z.infer<typeof tableActiveReservationSchema>;
export type AssignTableCaptainRequest = z.infer<typeof assignTableCaptainRequestSchema>;
export type AssignTableCaptainResponse = z.infer<typeof assignTableCaptainResponseSchema>;
export type CaptainOptionsResponse = z.infer<typeof captainOptionsResponseSchema>;
export type AssignTablesCaptainRequest = z.infer<typeof assignTablesCaptainRequestSchema>;
export type AssignTablesCaptainResponse = z.infer<typeof assignTablesCaptainResponseSchema>;
export type TableLifecycleStatusCode = z.infer<typeof tableLifecycleStatusCodeSchema>;
export type TableLifecycleStatus = z.infer<typeof tableLifecycleStatusSchema>;
export type TableLifecycleStatusListResponse = z.infer<
  typeof tableLifecycleStatusListResponseSchema
>;
export type TransitionTableStatusRequest = z.infer<typeof transitionTableStatusRequestSchema>;
export type TransitionTableStatusResponse = z.infer<typeof transitionTableStatusResponseSchema>;
export type RestaurantTable = z.infer<typeof restaurantTableSchema>;
export type TableListQuery = z.infer<typeof tableListQuerySchema>;
export type TableListResponse = z.infer<typeof tableListResponseSchema>;
export type TableBoardQuery = z.infer<typeof tableBoardQuerySchema>;
export type TableBoardResponse = z.infer<typeof tableBoardResponseSchema>;
export type TableOptionsResponse = z.infer<typeof tableOptionsResponseSchema>;
export type CreateTableRequest = z.infer<typeof createTableRequestSchema>;
export type CreateTableResponse = z.infer<typeof createTableResponseSchema>;
export type UpdateTableRequest = z.infer<typeof updateTableRequestSchema>;
export type UpdateTableResponse = z.infer<typeof updateTableResponseSchema>;
export type UpdateTableActiveRequest = z.infer<typeof updateTableActiveRequestSchema>;
export type UpdateTableActiveResponse = z.infer<typeof updateTableActiveResponseSchema>;
