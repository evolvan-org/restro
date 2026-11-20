import { type TodaySummary, todaySummarySchema } from '@rms/api-contract';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { BOARD_REFRESH_MS } from '@/lib/board-refresh';

export const TODAY_SUMMARY_QUERY_KEY = 'today-summary';

export function useTodaySummary(): UseQueryResult<TodaySummary> {
  return useQuery({
    queryKey: [TODAY_SUMMARY_QUERY_KEY],
    queryFn: async ({ signal }): Promise<TodaySummary> => {
      const response = await api.get('/dashboard/today-summary', {
        signal,
        errorDisplay: 'inline',
      });
      return todaySummarySchema.parse(response.data);
    },
    staleTime: 0,
    refetchInterval: BOARD_REFRESH_MS,
  });
}
