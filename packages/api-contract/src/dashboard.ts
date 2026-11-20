import { z } from 'zod';

/** Today's tenant-local dashboard metrics. Money stays decimal text over the wire. */
export const todaySummarySchema = z.object({
  revenue: z.string().regex(/^\d+\.\d{2}$/),
  currency: z.string().length(3),
  orders: z.number().int().nonnegative(),
  completedOrders: z.number().int().nonnegative(),
  activeTables: z.number().int().nonnegative(),
});

export type TodaySummary = z.infer<typeof todaySummarySchema>;
