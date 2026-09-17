import { statusResponseSchema, type StatusResponse } from '@rms/api-contract';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/** Calls the backend status endpoint and validates it against the shared contract. */
export async function getStatus(): Promise<StatusResponse> {
  const res = await fetch(`${API_URL}/status`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Status request failed (${res.status})`);
  }
  return statusResponseSchema.parse(await res.json());
}
