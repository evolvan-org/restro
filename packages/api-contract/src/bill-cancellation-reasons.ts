import { z } from 'zod';

import { billCancellationReasonSchema } from './bills';
import { paginatedResponseSchema, paginationQuerySchema } from './common';

export const managedBillCancellationReasonSchema = billCancellationReasonSchema.extend({
  isActive: z.boolean(),
});
export const managedBillCancellationReasonListQuerySchema = paginationQuerySchema.strict();
export const managedBillCancellationReasonListResponseSchema = paginatedResponseSchema(
  managedBillCancellationReasonSchema,
);
export const createBillCancellationReasonRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Reason is required').max(255, 'Use 255 characters or fewer'),
  })
  .strict();
export const renameBillCancellationReasonRequestSchema = createBillCancellationReasonRequestSchema;
export const deactivateBillCancellationReasonRequestSchema = z.object({}).strict();

export type ManagedBillCancellationReason = z.infer<typeof managedBillCancellationReasonSchema>;
export type ManagedBillCancellationReasonListQuery = z.infer<
  typeof managedBillCancellationReasonListQuerySchema
>;
export type ManagedBillCancellationReasonListResponse = z.infer<
  typeof managedBillCancellationReasonListResponseSchema
>;
export type CreateBillCancellationReasonRequest = z.infer<
  typeof createBillCancellationReasonRequestSchema
>;
export type RenameBillCancellationReasonRequest = z.infer<
  typeof renameBillCancellationReasonRequestSchema
>;
export type DeactivateBillCancellationReasonRequest = z.infer<
  typeof deactivateBillCancellationReasonRequestSchema
>;
