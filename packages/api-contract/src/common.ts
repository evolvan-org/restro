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
