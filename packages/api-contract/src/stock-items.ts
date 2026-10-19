import { z } from 'zod';

/** Mirrors the Prisma `Unit` enum. */
export const unitSchema = z.enum(['G', 'KG', 'ML', 'L', 'UNIT'], {
  errorMap: () => ({ message: 'Unit must be one of G, KG, ML, L, UNIT' }),
});

/** Seeded ingredient master entry, as shown in the recipe picker. */
export const stockItemSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
  })
  .strict();

export const stockItemListResponseSchema = z.array(stockItemSchema);

export type Unit = z.infer<typeof unitSchema>;
export type StockItem = z.infer<typeof stockItemSchema>;
export type StockItemListResponse = z.infer<typeof stockItemListResponseSchema>;
