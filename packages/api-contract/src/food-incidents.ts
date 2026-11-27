import { z } from 'zod';

import { dateOnlySchema, paginatedResponseSchema, paginationQuerySchema } from './common';

const id = z.string().uuid();
const note = z.string().trim().min(1, 'Enter details').max(4000);
const version = z.number().int().nonnegative();
export const foodIncidentStatusSchema = z.enum(['OPEN', 'RESOLVED']);
export const foodIncidentEntryKindSchema = z.enum(['NOTE', 'DECISION', 'CORRECTIVE_ACTION']);
export const createFoodIncidentSchema = z
  .object({
    title: z.string().trim().min(1, 'Name the incident').max(150),
    description: note,
    batchIds: z
      .array(id)
      .min(1, 'Select at least one batch')
      .max(100, 'Select no more than 100 batches')
      .refine((ids) => new Set(ids).size === ids.length, 'Select each batch once'),
  })
  .strict();
export const addFoodIncidentEntrySchema = z
  .object({
    expectedVersion: version,
    kind: foodIncidentEntryKindSchema,
    note,
  })
  .strict();
export const resolveFoodIncidentSchema = z.object({ expectedVersion: version, note }).strict();
export const foodIncidentQuerySchema = paginationQuerySchema
  .extend({ status: foodIncidentStatusSchema.optional() })
  .strict();
export const foodIncidentHistoryQuerySchema = paginationQuerySchema.strict();
export type FoodIncidentHistoryQuery = z.infer<typeof foodIncidentHistoryQuerySchema>;
const actor = z.object({ id, name: z.string() });
const batch = z.object({
  id,
  batchNumber: z.string(),
  stockItemId: id,
  stockItemName: z.string(),
  receiptId: id.nullable(),
  receivedAt: z.string().datetime(),
  expiryDate: dateOnlySchema.nullable(),
});
export const foodIncidentBatchOptionsSchema = paginatedResponseSchema(batch);
export const foodIncidentBatchQuerySchema = paginationQuerySchema.strict();
export type FoodIncidentBatchQuery = z.infer<typeof foodIncidentBatchQuerySchema>;
export type FoodIncidentBatchOptions = z.infer<typeof foodIncidentBatchOptionsSchema>;
export const foodIncidentSchema = z.object({
  id,
  title: z.string(),
  description: z.string(),
  status: foodIncidentStatusSchema,
  version,
  createdAt: z.string().datetime(),
  createdBy: actor,
  resolvedAt: z.string().datetime().nullable(),
  resolvedBy: actor.nullable(),
  resolution: z.string().nullable(),
  batches: z.array(batch),
});
export const foodIncidentsSchema = paginatedResponseSchema(foodIncidentSchema);
export const foodIncidentHistoryEntrySchema = z.object({
  id,
  kind: z.enum(['CREATED', 'NOTE', 'DECISION', 'CORRECTIVE_ACTION', 'RESOLVED']),
  note: z.string(),
  actor,
  createdAt: z.string().datetime(),
});
export const foodIncidentHistorySchema = paginatedResponseSchema(foodIncidentHistoryEntrySchema);
export type CreateFoodIncident = z.infer<typeof createFoodIncidentSchema>;
export type AddFoodIncidentEntry = z.infer<typeof addFoodIncidentEntrySchema>;
export type ResolveFoodIncident = z.infer<typeof resolveFoodIncidentSchema>;
export type FoodIncidentQuery = z.infer<typeof foodIncidentQuerySchema>;
export type FoodIncident = z.infer<typeof foodIncidentSchema>;
export type FoodIncidentList = z.infer<typeof foodIncidentsSchema>;
export type FoodIncidentHistory = z.infer<typeof foodIncidentHistorySchema>;
