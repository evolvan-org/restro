import { z } from 'zod';

/**
 * The single contract the API and web app share for the bootstrap:
 * a heartbeat proving the backend is reachable and online.
 */
export const statusResponseSchema = z.object({
  status: z.literal('online'),
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
});

export type StatusResponse = z.infer<typeof statusResponseSchema>;
