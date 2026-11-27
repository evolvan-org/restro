import {
  type AiJobContext,
  type AiJobDetailResponse,
  aiJobDetailResponseSchema,
  type AiRealtimeConfig,
  aiRealtimeConfigSchema,
  type AiUsageResponse,
  aiUsageResponseSchema,
  type BulkImportMenuItemsRequest,
  type BulkImportMenuItemsResponse,
  bulkImportMenuItemsResponseSchema,
  type CreateRecipeDraftRequest,
  type MarginPreviewRequest,
  type MarginPreviewResponse,
  marginPreviewResponseSchema,
  type MarginReport,
  marginReportSchema,
  type NotificationChannelAuthRequest,
  type NotificationChannelAuthResponse,
  notificationChannelAuthResponseSchema,
  type ReceiptChecksRequest,
  type ReceiptChecksResponse,
  receiptChecksResponseSchema,
} from '@rms/api-contract';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAccessToken } from '@/store/hooks/auth';

export const AiQueryKey = {
  Usage: 'ai-usage',
  Job: 'ai-job',
  Realtime: 'ai-realtime',
  Margins: 'margins',
} as const;

export type ScanKind = 'menu' | 'invoice';

export type PreparedPage = {
  blob: Blob;
  width: number;
  height: number;
  sharpness?: number;
};

export function useAiUsage(enabled = true): UseQueryResult<AiUsageResponse> {
  const token = useAccessToken();
  return useQuery({
    queryKey: [AiQueryKey.Usage],
    queryFn: async () => aiUsageResponseSchema.parse((await api.get('/ai/usage')).data),
    enabled: enabled && Boolean(token),
    staleTime: 30_000,
  });
}

export function useAiRealtime(enabled = true): UseQueryResult<AiRealtimeConfig> {
  const token = useAccessToken();
  return useQuery({
    queryKey: [AiQueryKey.Realtime],
    queryFn: async () =>
      aiRealtimeConfigSchema.parse(
        (await api.get('/ai/realtime', { errorDisplay: 'inline' })).data,
      ),
    enabled: enabled && Boolean(token),
    staleTime: Infinity,
    retry: false,
  });
}

export async function authorizeAiChannel(
  input: NotificationChannelAuthRequest,
): Promise<NotificationChannelAuthResponse> {
  const response = await api.post('/ai/realtime/auth', input, { errorDisplay: 'inline' });
  return notificationChannelAuthResponseSchema.parse(response.data);
}

/** Uploads normalised page photos and starts reading them. Errors are shown by the caller. */
export async function createScan(
  kind: ScanKind,
  pages: readonly PreparedPage[],
  context: AiJobContext,
): Promise<AiJobDetailResponse> {
  const form = new FormData();
  pages.forEach((page, index) => form.append('pages', page.blob, `page-${index + 1}.jpg`));
  form.append('context', context);
  form.append(
    'pageInfo',
    JSON.stringify(
      pages.map((page) => ({
        width: page.width,
        height: page.height,
        ...(page.sharpness !== undefined && { sharpness: page.sharpness }),
      })),
    ),
  );
  const response = await api.post(`/ai/${kind}-scans`, form, { errorDisplay: 'inline' });
  return aiJobDetailResponseSchema.parse(response.data);
}

export async function retakeScanPage(
  kind: ScanKind,
  jobId: string,
  page: number,
  photo: PreparedPage,
): Promise<AiJobDetailResponse> {
  const form = new FormData();
  form.append('page', photo.blob, `page-${page}.jpg`);
  const response = await api.post(`/ai/${kind}-scans/${jobId}/pages/${page}`, form, {
    errorDisplay: 'inline',
  });
  return aiJobDetailResponseSchema.parse(response.data);
}

export async function createRecipeDraft(
  input: CreateRecipeDraftRequest,
): Promise<AiJobDetailResponse> {
  const response = await api.post('/ai/recipe-drafts', input, { errorDisplay: 'inline' });
  return aiJobDetailResponseSchema.parse(response.data);
}

export async function fetchAiJob(jobId: string): Promise<AiJobDetailResponse> {
  const response = await api.get(`/ai/jobs/${jobId}`, { errorDisplay: 'inline' });
  return aiJobDetailResponseSchema.parse(response.data);
}

export async function cancelAiJob(jobId: string, purge = false): Promise<AiJobDetailResponse> {
  const response = await api.post(
    `/ai/jobs/${jobId}/cancel`,
    { purge },
    { errorDisplay: 'inline' },
  );
  return aiJobDetailResponseSchema.parse(response.data);
}

/** Done with a scan: the server deletes its photos. Best effort. */
export async function releaseAiJob(jobId: string): Promise<void> {
  try {
    await api.post(`/ai/jobs/${jobId}/release`, undefined, { errorDisplay: 'inline' });
  } catch {
    // The server's sweep deletes unused photos anyway.
  }
}

export async function fetchScanPageImage(jobId: string, page: number): Promise<Blob> {
  const response = await api.get(`/ai/jobs/${jobId}/pages/${page}`, {
    responseType: 'blob',
    errorDisplay: 'inline',
  });
  return response.data as Blob;
}

export function useMarginReport(enabled = true): UseQueryResult<MarginReport> {
  const token = useAccessToken();
  return useQuery({
    queryKey: [AiQueryKey.Margins],
    queryFn: async () => marginReportSchema.parse((await api.get('/margins')).data),
    enabled: enabled && Boolean(token),
  });
}

export async function previewMargins(input: MarginPreviewRequest): Promise<MarginPreviewResponse> {
  const response = await api.post('/margins/preview', input, { errorDisplay: 'inline' });
  return marginPreviewResponseSchema.parse(response.data);
}

export async function checkReceipt(input: ReceiptChecksRequest): Promise<ReceiptChecksResponse> {
  const response = await api.post('/inventory/goods-receipts/checks', input, {
    errorDisplay: 'inline',
  });
  return receiptChecksResponseSchema.parse(response.data);
}

export function useBulkImportMenu(): UseMutationResult<
  BulkImportMenuItemsResponse,
  Error,
  BulkImportMenuItemsRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      const response = await api.post('/menu-items/bulk-import', input, { errorDisplay: 'inline' });
      return bulkImportMenuItemsResponseSchema.parse(response.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
