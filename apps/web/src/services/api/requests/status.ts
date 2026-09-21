import { useQuery } from '@tanstack/react-query';

import { getStatus } from '@/lib/api';

import { StatusQueryKey } from '../types/StatusQueryKey';

/** Server health/status, validated against the shared `@rms/api-contract`. */
export function useStatus() {
  return useQuery({
    queryKey: [StatusQueryKey.Status],
    queryFn: getStatus,
    retry: 1,
  });
}
