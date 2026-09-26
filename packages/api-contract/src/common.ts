import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type PageMeta } from '@rms/shared';
import { z } from 'zod';

/** Envelope every error response conforms to (see docs/02-api-standards.md). */
export const errorResponseSchema = z.object({
  statusCode: z.number(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string().optional(),
  timestamp: z.string(),
  path: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** `page` / `pageSize` query parameters accepted by every list endpoint. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const pageMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
}) satisfies z.ZodType<PageMeta>;

/** Zod counterpart of `Paginated<T>` from `@rms/shared`: `{ data, meta }`. */
export function paginatedResponseSchema<TItem extends z.ZodTypeAny>(
  item: TItem,
): z.ZodObject<{ data: z.ZodArray<TItem>; meta: typeof pageMetaSchema }> {
  return z.object({ data: z.array(item), meta: pageMetaSchema });
}
