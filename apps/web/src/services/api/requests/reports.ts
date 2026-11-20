import {
  type DailySalesReport,
  dailySalesReportSchema,
  type GstReport,
  gstReportSchema,
  type ReportDateRange,
} from '@rms/api-contract';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useDailySalesReport(
  range: ReportDateRange | undefined,
): UseQueryResult<DailySalesReport> {
  return useQuery({
    queryKey: ['reports', 'daily-sales', range],
    queryFn: async ({ signal }) => {
      const response = await api.get('/reports/daily-sales', {
        params: range,
        signal,
        errorDisplay: 'inline',
      });
      return dailySalesReportSchema.parse(response.data);
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useGstReport(range: ReportDateRange | undefined): UseQueryResult<GstReport> {
  return useQuery({
    queryKey: ['reports', 'gst', range],
    enabled: range !== undefined,
    queryFn: async ({ signal }) => {
      const response = await api.get('/reports/gst', {
        params: range,
        signal,
        errorDisplay: 'inline',
      });
      return gstReportSchema.parse(response.data);
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
