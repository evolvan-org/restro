import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';

const statusCodeSchema = z
  .string()
  .trim()
  .min(1, 'Code is required')
  .max(50, 'Code must be 50 characters or fewer')
  .refine((code) => code.toUpperCase().length <= 50, 'Code must be 50 characters or fewer')
  .transform((code) => code.toUpperCase())
  .describe('Machine-readable status code; normalized to uppercase');

const statusNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must be 100 characters or fewer');

export const tableStatusSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    isSystem: z.boolean(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const tableStatusListQuerySchema = paginationQuerySchema;
export const tableStatusListResponseSchema = paginatedResponseSchema(tableStatusSchema);

const tableStatusFieldsSchema = z
  .object({
    code: statusCodeSchema,
    name: statusNameSchema,
  })
  .strict();

export const createTableStatusRequestSchema = tableStatusFieldsSchema;
export const updateTableStatusRequestSchema = tableStatusFieldsSchema;

export const updateTableStatusActiveRequestSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export type TableStatus = z.infer<typeof tableStatusSchema>;
export type TableStatusListQuery = z.infer<typeof tableStatusListQuerySchema>;
export type TableStatusListResponse = z.infer<typeof tableStatusListResponseSchema>;
export type CreateTableStatusRequest = z.infer<typeof createTableStatusRequestSchema>;
export type UpdateTableStatusRequest = z.infer<typeof updateTableStatusRequestSchema>;
export type UpdateTableStatusActiveRequest = z.infer<typeof updateTableStatusActiveRequestSchema>;
