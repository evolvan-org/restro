import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';

const statusCodeSchema = z
  .string()
  .trim()
  .min(1, 'Code is required')
  .max(50, 'Code must be 50 characters or fewer')
  .transform((code) => code.toUpperCase())
  .describe('Machine-readable status code; normalized to uppercase');

const statusNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must be 100 characters or fewer');

const sortOrderSchema = z
  .number({ invalid_type_error: 'Display order must be a number' })
  .int('Display order must be a whole number')
  .min(0, 'Display order cannot be negative');

export const tableStatusSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    sortOrder: z.number().int(),
    isSystem: z.boolean(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const tableStatusListQuerySchema = paginationQuerySchema;
export const tableStatusListResponseSchema = paginatedResponseSchema(tableStatusSchema);

export const createTableStatusRequestSchema = z
  .object({
    code: statusCodeSchema,
    name: statusNameSchema,
    sortOrder: sortOrderSchema.optional().describe('Omit to place the status at the end'),
  })
  .strict();

export const updateTableStatusRequestSchema = z
  .object({
    code: statusCodeSchema,
    name: statusNameSchema,
    sortOrder: sortOrderSchema,
  })
  .strict();

export const updateTableStatusActiveRequestSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const reorderTableStatusesRequestSchema = z
  .object({
    orderedIds: z
      .array(z.string().uuid())
      .min(1, 'At least one status is required')
      .refine((ids) => new Set(ids).size === ids.length, 'Status ids must be unique')
      .describe('Every table status id in the restaurant, in the desired display order'),
  })
  .strict();

export const reorderTableStatusesResponseSchema = z.array(tableStatusSchema);

export type TableStatus = z.infer<typeof tableStatusSchema>;
export type TableStatusListQuery = z.infer<typeof tableStatusListQuerySchema>;
export type TableStatusListResponse = z.infer<typeof tableStatusListResponseSchema>;
export type CreateTableStatusRequest = z.infer<typeof createTableStatusRequestSchema>;
export type UpdateTableStatusRequest = z.infer<typeof updateTableStatusRequestSchema>;
export type UpdateTableStatusActiveRequest = z.infer<typeof updateTableStatusActiveRequestSchema>;
export type ReorderTableStatusesRequest = z.infer<typeof reorderTableStatusesRequestSchema>;
export type ReorderTableStatusesResponse = z.infer<typeof reorderTableStatusesResponseSchema>;
