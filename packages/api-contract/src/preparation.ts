import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';

export const kotStatusSchema = z.enum(['PENDING', 'PREPARING', 'READY', 'COMPLETED']);

export const preparationSchema = z
  .object({
    version: z.number().int().nonnegative(),
    acceptedAt: z.string().datetime().nullable(),
    heldAt: z.string().datetime().nullable(),
    holdReason: z.string().nullable(),
    isPriority: z.boolean(),
    targetSeconds: z.number().int().positive().nullable(),
  })
  .strict();

const expectedVersion = z.number().int().nonnegative();
export const preparationControlRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ACCEPT'), expectedVersion }).strict(),
  z
    .object({
      action: z.literal('HOLD'),
      expectedVersion,
      reason: z.string().trim().min(1, 'Enter a hold reason').max(255),
    })
    .strict(),
  z.object({ action: z.literal('RELEASE'), expectedVersion }).strict(),
  z.object({ action: z.literal('PRIORITY'), expectedVersion, isPriority: z.boolean() }).strict(),
  z
    .object({
      action: z.literal('TARGET'),
      expectedVersion,
      targetSeconds: z.number().int().min(1).max(86400).nullable(),
    })
    .strict(),
]);

export const preparationEventSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum([
      'SENT',
      'BASELINE',
      'ACCEPT',
      'HOLD',
      'RELEASE',
      'PRIORITY',
      'TARGET',
      'STATUS',
      'VOID',
    ]),
    status: kotStatusSchema,
    state: preparationSchema,
    reason: z.string().nullable(),
    recordedBy: z.object({ id: z.string().uuid(), name: z.string() }).strict(),
    createdAt: z.string().datetime(),
  })
  .strict();
export const preparationHistoryQuerySchema = paginationQuerySchema;
export const preparationHistoryResponseSchema = paginatedResponseSchema(preparationEventSchema);
export type PreparationControlRequest = z.infer<typeof preparationControlRequestSchema>;
export type PreparationState = z.infer<typeof preparationSchema>;
export type PreparationHistoryQuery = z.infer<typeof preparationHistoryQuerySchema>;
export type PreparationHistoryResponse = z.infer<typeof preparationHistoryResponseSchema>;
