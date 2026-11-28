import { z } from 'zod';

import { dateOnlySchema, paginatedResponseSchema, paginationQuerySchema } from './common';

export const operatingTaskKindSchema = z.enum([
  'OPENING',
  'CLOSING',
  'CLEANING',
  'TEMPERATURE',
  'EXPIRY',
]);
export const operatingTaskStatusSchema = z.enum(['PENDING', 'COMPLETED', 'EXCEPTION', 'CANCELLED']);
const personSchema = z.object({ id: z.string().uuid(), name: z.string() }).strict();
export const operatingTaskResultSchema = z
  .object({
    notes: z.string().trim().min(1, 'Record what was checked').max(2000),
    temperatureCelsius: z
      .string()
      .trim()
      .regex(/^-?\d{1,8}(\.\d{1,3})?$/, 'Enter a Celsius measurement')
      .nullable(),
    observedExpiryDate: dateOnlySchema.nullable(),
  })
  .strict();
export const createOperatingTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    kind: operatingTaskKindSchema,
    instructions: z.string().trim().max(2000),
    assignedToUserId: z.string().uuid(),
    dueAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const updateOperatingTaskSchema = createOperatingTaskSchema.extend({
  expectedVersion: z.number().int().nonnegative(),
});
export const recordOperatingTaskSchema = operatingTaskResultSchema.extend({
  expectedVersion: z.number().int().nonnegative(),
  outcome: z.enum(['COMPLETED', 'EXCEPTION']),
});
export const cancelOperatingTaskSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export const resolveOperatingTaskSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    resolution: z.string().trim().min(1).max(2000),
  })
  .strict();
export const operatingTaskSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    kind: operatingTaskKindSchema,
    instructions: z.string(),
    assignedTo: personSchema,
    createdBy: personSchema,
    dueAt: z.string().datetime(),
    status: operatingTaskStatusSchema,
    version: z.number().int().nonnegative(),
    completedAt: z.string().datetime().nullable(),
    result: operatingTaskResultSchema.nullable(),
    resolution: z.string().nullable(),
    isOverdue: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const operatingTaskQuerySchema = paginationQuerySchema
  .extend({
    status: operatingTaskStatusSchema.optional(),
    kind: operatingTaskKindSchema.optional(),
    assignedToUserId: z.string().uuid().optional(),
  })
  .strict();
export const operatingTaskListSchema = paginatedResponseSchema(operatingTaskSchema).extend({
  updatedAt: z.string().datetime(),
});
export const operatingTaskAssigneesSchema = z.object({ data: z.array(personSchema) }).strict();
export const operatingTaskEventSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(['CREATED', 'UPDATED', 'COMPLETED', 'EXCEPTION', 'RESOLVED', 'CANCELLED']),
    snapshot: operatingTaskSchema.omit({ isOverdue: true }),
    wasOverdue: z.boolean(),
    reason: z.string().nullable(),
    recordedBy: personSchema,
    createdAt: z.string().datetime(),
  })
  .strict();
export const operatingTaskHistorySchema = paginatedResponseSchema(operatingTaskEventSchema);
export type CreateOperatingTask = z.infer<typeof createOperatingTaskSchema>;
export type UpdateOperatingTask = z.infer<typeof updateOperatingTaskSchema>;
export type RecordOperatingTask = z.infer<typeof recordOperatingTaskSchema>;
export type CancelOperatingTask = z.infer<typeof cancelOperatingTaskSchema>;
export type ResolveOperatingTask = z.infer<typeof resolveOperatingTaskSchema>;
export type OperatingTask = z.infer<typeof operatingTaskSchema>;
export type OperatingTaskQuery = z.infer<typeof operatingTaskQuerySchema>;
export type OperatingTaskList = z.infer<typeof operatingTaskListSchema>;
export type OperatingTaskHistory = z.infer<typeof operatingTaskHistorySchema>;
export type OperatingTaskAssignees = z.infer<typeof operatingTaskAssigneesSchema>;

export const operatingTaskHistoryQuerySchema = paginationQuerySchema;
export type OperatingTaskHistoryQuery = z.infer<typeof operatingTaskHistoryQuerySchema>;
