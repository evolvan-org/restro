import { z } from 'zod';

import { paginatedResponseSchema, paginationQuerySchema } from './common';
import { menuItemSchema } from './menu-items';

export const menuHistoryReasonSchema = z.enum(['BASELINE', 'CREATED', 'UPDATED', 'PRICE_CHANGED']);

/** BASELINE records what was observed before the first audited change, not invented past history. */
export const menuItemRevisionSchema = z
  .object({
    id: z.string().uuid(),
    menuItemId: z.string().uuid(),
    revision: z.number().int().positive(),
    reason: menuHistoryReasonSchema,
    recordedBy: z.object({ id: z.string().uuid(), name: z.string() }).strict(),
    createdAt: z.string().datetime(),
    snapshot: menuItemSchema,
  })
  .strict();

export const menuItemHistoryQuerySchema = paginationQuerySchema;
export const menuItemHistoryResponseSchema = paginatedResponseSchema(menuItemRevisionSchema);

export type MenuHistoryReason = z.infer<typeof menuHistoryReasonSchema>;
export type MenuItemRevision = z.infer<typeof menuItemRevisionSchema>;
export type MenuItemHistoryQuery = z.infer<typeof menuItemHistoryQuerySchema>;
export type MenuItemHistoryResponse = z.infer<typeof menuItemHistoryResponseSchema>;
