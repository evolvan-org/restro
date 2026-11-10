import { z } from 'zod';

export const billStatusSchema = z.enum(['OPEN', 'PAID', 'CANCELLED']);

export const billSummarySchema = z
  .object({
    id: z.string().uuid(),
    billNumber: z.string(),
    status: billStatusSchema,
  })
  .strict();

export type BillSummary = z.infer<typeof billSummarySchema>;
