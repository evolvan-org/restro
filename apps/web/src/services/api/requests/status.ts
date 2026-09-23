import { useQuery } from '@tanstack/react-query';
import { statusResponseSchema, type StatusResponse } from '@rms/api-contract';
import { api } from '@/lib/api';

import { StatusQueryKey } from '../types/StatusQueryKey';

/** Calls the backend status endpoint and validates it against the shared contract. */
async function getStatus(): Promise<StatusResponse> {
  const res = await api.get('/status');

  return statusResponseSchema.parse(res.data);
}

/** Server health/status, validated against the shared `@rms/api-contract`. */
export function useStatus() {
  return useQuery({
    queryKey: [StatusQueryKey.Status],
    queryFn: getStatus,
    retry: 1,
  });
}
