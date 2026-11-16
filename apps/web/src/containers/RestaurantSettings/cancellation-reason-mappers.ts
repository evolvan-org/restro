import type { CreateBillCancellationReasonRequest } from '@rms/api-contract';
import { z } from 'zod';

export const cancellationReasonPaginationSchema = z.object({ page: z.number().int().min(1) });
export type CancellationReasonPagination = z.infer<typeof cancellationReasonPaginationSchema>;
export function cancellationReasonPaginationDefaults(): CancellationReasonPagination {
  return { page: 1 };
}
export function cancellationReasonDefaults(name = ''): CreateBillCancellationReasonRequest {
  return { name };
}
