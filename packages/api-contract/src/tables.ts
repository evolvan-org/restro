import { z } from 'zod';
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
  })
  .strict();

export const createTableRequestSchema = tableDetailsSchema;

export const updateTableRequestSchema = tableDetailsSchema
  .omit({ currentStatusId: true })
  .partial()
  .refine(
    ({ tableNumber, capacity, sectionId }) =>
      tableNumber !== undefined || capacity !== undefined || sectionId !== undefined,
    { message: 'At least one field must be provided for update' },
  );

export const updateTableActiveRequestSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const tableListResponseSchema = paginatedResponseSchema(restaurantTableSchema);
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
export type TableOptionsResponse = z.infer<typeof tableOptionsResponseSchema>;
export type CreateTableRequest = z.infer<typeof createTableRequestSchema>;
export type CreateTableResponse = z.infer<typeof createTableResponseSchema>;
export type UpdateTableRequest = z.infer<typeof updateTableRequestSchema>;
export type UpdateTableResponse = z.infer<typeof updateTableResponseSchema>;
export type UpdateTableActiveRequest = z.infer<typeof updateTableActiveRequestSchema>;
export type UpdateTableActiveResponse = z.infer<typeof updateTableActiveResponseSchema>;
