import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type PageMeta } from '@rms/shared';
import { z } from 'zod';

/**
 * Machine-readable reasons a client branches on, sent as `code` in the error envelope. Messages
 * stay human-readable and may change; codes don't.
 */
export const API_ERROR_CODES = {
  /** Login by a non-owner while the restaurant's setup is unfinished (403, no token issued). */
  ONBOARDING_INCOMPLETE: 'ONBOARDING_INCOMPLETE',
  /** The owner called a non-setup endpoint while setup is unfinished (403). */
  ONBOARDING_REQUIRED: 'ONBOARDING_REQUIRED',
  /** Finish was already run (409). */
  ONBOARDING_ALREADY_COMPLETED: 'ONBOARDING_ALREADY_COMPLETED',
  /** The draft was saved from somewhere else since it was loaded (409, latest draft attached). */
  ONBOARDING_DRAFT_CONFLICT: 'ONBOARDING_DRAFT_CONFLICT',
  /** Finish failed and rolled back; `stage` names the failing phase. */
  ONBOARDING_STAGE_FAILED: 'ONBOARDING_STAGE_FAILED',
  /** The account still has its one-time password (403). */
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
} as const;

export const apiErrorCodeSchema = z.nativeEnum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Envelope every error response conforms to (see docs/02-api-standards.md). */
export const errorResponseSchema = z.object({
  statusCode: z.number(),
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string().optional(),
  code: apiErrorCodeSchema.optional(),
  timestamp: z.string(),
  path: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const messageResponseSchema = z.object({ message: z.string() }).strict();
export type MessageResponse = z.infer<typeof messageResponseSchema>;

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

/**
 * Calendar date as `YYYY-MM-DD`. Rejects year 0000, which `z.string().date()` accepts but
 * PostgreSQL's DATE type does not (it would otherwise surface as a 500, not a 400).
 */
export const dateOnlySchema = z
  .string({ required_error: 'Choose a date' })
  .regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/, 'Enter a date in YYYY-MM-DD format')
  .date('Enter a valid date');
