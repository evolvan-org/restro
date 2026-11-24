import {
  type PushConfigResponse,
  pushConfigResponseSchema,
  type QrAlertsResponse,
  qrAlertsResponseSchema,
  type QrApproveRoundRequest,
  qrApproveRoundRequestSchema,
  type QrAssignCaptainRequest,
  qrAssignCaptainRequestSchema,
  type QrAssignCaptainResponse,
  qrAssignCaptainResponseSchema,
  type QrCaptainOptionsResponse,
  qrCaptainOptionsResponseSchema,
  type QrChannelAuthRequest,
  qrChannelAuthRequestSchema,
  type QrChannelAuthResponse,
  qrChannelAuthResponseSchema,
  type QrCollectAtTableRequest,
  qrCollectAtTableRequestSchema,
  type QrFloorResponse,
  qrFloorResponseSchema,
  type QrQueueResponse,
  qrQueueResponseSchema,
  type QrQueueScope,
  type QrRealtimeConfig,
  qrRealtimeConfigSchema,
  type QrRecordSharePaymentRequest,
  qrRecordSharePaymentRequestSchema,
  type QrRejectRoundRequest,
  qrRejectRoundRequestSchema,
  type QrRoundDetail,
  qrRoundDetailSchema,
  type QrSettings,
  qrSettingsSchema,
  type QrStaffBill,
  qrStaffBillSchema,
  type QrSummaryResponse,
  qrSummaryResponseSchema,
  type QrTableCard,
  qrTableCardSchema,
  type QrTableCardsResponse,
  qrTableCardsResponseSchema,
  type UpdateQrSettingsRequest,
  updateQrSettingsRequestSchema,
  type UploadUpiQrRequest,
  uploadUpiQrRequestSchema,
} from '@rms/api-contract';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';
import { useAccessToken } from '@/store/hooks/auth';

import { QrQueryKey } from '../types/QrQueryKey';

/** Live updates arrive over Pusher; this slower poll is the automatic fallback. */
export const QR_FALLBACK_REFRESH_MS = 15_000;

const live = {
  refetchInterval: QR_FALLBACK_REFRESH_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  retry: 1,
} as const;

export function useQrQueue(scope: QrQueueScope, enabled = true): UseQueryResult<QrQueueResponse> {
  return useQuery({
    queryKey: [QrQueryKey.Queue, scope],
    queryFn: async ({ signal }) =>
      qrQueueResponseSchema.parse(
        (await api.get('/qr-orders', { params: { scope }, signal, errorDisplay: 'inline' })).data,
      ),
    enabled,
    ...live,
  });
}

export function useQrSummary(enabled: boolean): UseQueryResult<QrSummaryResponse> {
  return useQuery({
    queryKey: [QrQueryKey.Summary],
    queryFn: async ({ signal }) =>
      qrSummaryResponseSchema.parse(
        (await api.get('/qr-orders/summary', { signal, errorDisplay: 'inline' })).data,
      ),
    enabled,
    ...live,
  });
}

export function useQrRound(roundId: string | null): UseQueryResult<QrRoundDetail> {
  return useQuery({
    queryKey: [QrQueryKey.Round, roundId],
    queryFn: async ({ signal }) =>
      qrRoundDetailSchema.parse(
        (await api.get(`/qr-orders/rounds/${roundId}`, { signal, errorDisplay: 'inline' })).data,
      ),
    enabled: Boolean(roundId),
    ...live,
  });
}

export function useQrBill(sessionId: string | null): UseQueryResult<QrStaffBill> {
  return useQuery({
    queryKey: [QrQueryKey.Bill, sessionId],
    queryFn: async ({ signal }) =>
      qrStaffBillSchema.parse(
        (await api.get(`/qr-orders/sessions/${sessionId}/bill`, { signal, errorDisplay: 'inline' }))
          .data,
      ),
    enabled: Boolean(sessionId),
    ...live,
  });
}

export function useQrAlerts(enabled: boolean): UseQueryResult<QrAlertsResponse> {
  return useQuery({
    queryKey: [QrQueryKey.Alerts],
    queryFn: async ({ signal }) =>
      qrAlertsResponseSchema.parse(
        (await api.get('/qr-orders/alerts', { signal, errorDisplay: 'inline' })).data,
      ),
    enabled,
    ...live,
  });
}

export function useQrFloor(enabled: boolean): UseQueryResult<QrFloorResponse> {
  return useQuery({
    queryKey: [QrQueryKey.Floor],
    queryFn: async ({ signal }) =>
      qrFloorResponseSchema.parse(
        (await api.get('/qr-orders/floor', { signal, errorDisplay: 'inline' })).data,
      ),
    enabled,
    ...live,
  });
}

export function useQrCaptains(tableId: string | null): UseQueryResult<QrCaptainOptionsResponse> {
  return useQuery({
    queryKey: [QrQueryKey.Captains, tableId],
    queryFn: async ({ signal }) =>
      qrCaptainOptionsResponseSchema.parse(
        (
          await api.get('/qr-orders/captains', {
            params: tableId ? { tableId } : {},
            signal,
            errorDisplay: 'inline',
          })
        ).data,
      ),
    enabled: Boolean(tableId),
    retry: false,
  });
}

/** Refreshes every QR view after a staff action (the live event does the same for others). */
function useInvalidateQr(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      [
        QrQueryKey.Queue,
        QrQueryKey.Summary,
        QrQueryKey.Round,
        QrQueryKey.Bill,
        QrQueryKey.Alerts,
        QrQueryKey.Floor,
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };
}

export function useApproveQrRound(
  roundId: string,
): UseMutationResult<QrRoundDetail, unknown, QrApproveRoundRequest> {
  const invalidate = useInvalidateQr();
  const showApiError = useShowApiError('Unable to approve the order.');
  return useMutation({
    mutationFn: async (input) =>
      qrRoundDetailSchema.parse(
        (
          await api.post(
            `/qr-orders/rounds/${roundId}/approve`,
            qrApproveRoundRequestSchema.parse(input),
          )
        ).data,
      ),
    onSuccess: invalidate,
    onError: async (error) => {
      showApiError(error);
      await invalidate();
    },
  });
}

export function useRejectQrRound(
  roundId: string,
): UseMutationResult<QrRoundDetail, unknown, QrRejectRoundRequest> {
  const invalidate = useInvalidateQr();
  const showApiError = useShowApiError('Unable to reject the order.');
  return useMutation({
    mutationFn: async (input) =>
      qrRoundDetailSchema.parse(
        (
          await api.post(
            `/qr-orders/rounds/${roundId}/reject`,
            qrRejectRoundRequestSchema.parse(input),
          )
        ).data,
      ),
    onSuccess: invalidate,
    onError: showApiError,
  });
}

export function useQrOnMyWay(roundId: string): UseMutationResult<QrRoundDetail, unknown, void> {
  const invalidate = useInvalidateQr();
  const showApiError = useShowApiError('Unable to update the order.');
  return useMutation({
    mutationFn: async () =>
      qrRoundDetailSchema.parse((await api.post(`/qr-orders/rounds/${roundId}/on-my-way`)).data),
    onSuccess: invalidate,
    onError: showApiError,
  });
}

export function useRecordQrSharePayment(): UseMutationResult<
  QrStaffBill,
  unknown,
  { shareId: string; input: QrRecordSharePaymentRequest }
> {
  const invalidate = useInvalidateQr();
  const showApiError = useShowApiError('Unable to record the payment.');
  return useMutation({
    mutationFn: async ({ shareId, input }) =>
      qrStaffBillSchema.parse(
        (
          await api.post(
            `/qr-orders/shares/${shareId}/payment`,
            qrRecordSharePaymentRequestSchema.parse(input),
          )
        ).data,
      ),
    onSettled: invalidate,
    onError: showApiError,
  });
}

export function useCollectQrAtTable(
  sessionId: string,
): UseMutationResult<QrStaffBill, unknown, QrCollectAtTableRequest> {
  const invalidate = useInvalidateQr();
  const showApiError = useShowApiError('Unable to record the payment.');
  return useMutation({
    mutationFn: async (input) =>
      qrStaffBillSchema.parse(
        (
          await api.post(
            `/qr-orders/sessions/${sessionId}/collect`,
            qrCollectAtTableRequestSchema.parse(input),
          )
        ).data,
      ),
    onSettled: invalidate,
    onError: showApiError,
  });
}

export function useAssignQrCaptain(): UseMutationResult<
  QrAssignCaptainResponse,
  unknown,
  { tableId: string; input: QrAssignCaptainRequest }
> {
  const invalidate = useInvalidateQr();
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to assign the captain.');
  return useMutation({
    mutationFn: async ({ tableId, input }) =>
      qrAssignCaptainResponseSchema.parse(
        (
          await api.post(
            `/qr-orders/tables/${tableId}/captain`,
            qrAssignCaptainRequestSchema.parse(input),
          )
        ).data,
      ),
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: [QrQueryKey.Captains] });
      // The floor board's table tiles show the captain too.
      await queryClient.invalidateQueries();
    },
    onError: showApiError,
  });
}

export function useDismissQrAlert(): UseMutationResult<unknown, unknown, string> {
  const invalidate = useInvalidateQr();
  const showApiError = useShowApiError('Unable to dismiss the alert.');
  return useMutation({
    mutationFn: async (alertId) => (await api.post(`/qr-orders/alerts/${alertId}/dismiss`)).data,
    onSettled: invalidate,
    onError: showApiError,
  });
}

/** The restaurant's uploaded UPI QR as an object URL (fetched with the staff token). */
export function useUpiQrImage(enabled: boolean): UseQueryResult<string | null> {
  return useQuery({
    queryKey: [QrQueryKey.UpiQr],
    queryFn: async ({ signal }) => {
      try {
        const response = await api.get('/qr-orders/upi-qr', {
          responseType: 'blob',
          signal,
          errorDisplay: 'inline',
        });
        return URL.createObjectURL(response.data as Blob);
      } catch (error) {
        if ((error as { response?: { status?: number } }).response?.status === 404) return null;
        throw error;
      }
    },
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// ----- Settings & cards -----

export function useQrSettings(enabled: boolean): UseQueryResult<QrSettings> {
  return useQuery({
    queryKey: [QrQueryKey.Settings],
    queryFn: async ({ signal }) =>
      qrSettingsSchema.parse(
        (await api.get('/qr-orders/settings', { signal, errorDisplay: 'inline' })).data,
      ),
    enabled,
  });
}

export function useUpdateQrSettings(): UseMutationResult<
  QrSettings,
  unknown,
  UpdateQrSettingsRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) =>
      qrSettingsSchema.parse(
        (await api.put('/qr-orders/settings', updateQrSettingsRequestSchema.parse(input))).data,
      ),
    onSuccess: (settings) => {
      queryClient.setQueryData([QrQueryKey.Settings], settings);
      void queryClient.invalidateQueries({ queryKey: [QrQueryKey.Cards] });
      void queryClient.invalidateQueries({ queryKey: [QrQueryKey.Summary] });
    },
  });
}

export function useUploadUpiQr(): UseMutationResult<QrSettings, unknown, UploadUpiQrRequest> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to upload the UPI QR code.');
  return useMutation({
    mutationFn: async (input) =>
      qrSettingsSchema.parse(
        (await api.put('/qr-orders/settings/upi-qr', uploadUpiQrRequestSchema.parse(input))).data,
      ),
    onSuccess: (settings) => {
      queryClient.setQueryData([QrQueryKey.Settings], settings);
      void queryClient.invalidateQueries({ queryKey: [QrQueryKey.UpiQr] });
    },
    onError: showApiError,
  });
}

export function useDeleteUpiQr(): UseMutationResult<QrSettings, unknown, void> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to remove the UPI QR code.');
  return useMutation({
    mutationFn: async () =>
      qrSettingsSchema.parse((await api.delete('/qr-orders/settings/upi-qr')).data),
    onSuccess: (settings) => {
      queryClient.setQueryData([QrQueryKey.Settings], settings);
      void queryClient.invalidateQueries({ queryKey: [QrQueryKey.UpiQr] });
    },
    onError: showApiError,
  });
}

export function useQrCards(enabled: boolean): UseQueryResult<QrTableCardsResponse> {
  return useQuery({
    queryKey: [QrQueryKey.Cards],
    queryFn: async ({ signal }) =>
      qrTableCardsResponseSchema.parse(
        (await api.get('/qr-orders/cards', { signal, errorDisplay: 'inline' })).data,
      ),
    enabled,
  });
}

export function useRotateQrToken(): UseMutationResult<QrTableCard, unknown, string> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to regenerate the QR code.');
  return useMutation({
    mutationFn: async (tableId) =>
      qrTableCardSchema.parse((await api.post(`/qr-orders/tables/${tableId}/rotate-token`)).data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [QrQueryKey.Cards] }),
    onError: showApiError,
  });
}

// ----- Realtime & push -----

export function useQrRealtimeConfig(enabled: boolean): UseQueryResult<QrRealtimeConfig> {
  const token = useAccessToken();
  return useQuery({
    queryKey: [QrQueryKey.Realtime],
    queryFn: async ({ signal }) =>
      qrRealtimeConfigSchema.parse(
        (await api.get('/qr-orders/realtime', { signal, errorDisplay: 'inline' })).data,
      ),
    enabled: enabled && Boolean(token),
    staleTime: Infinity,
    retry: false,
  });
}

export async function authorizeQrChannel(
  input: QrChannelAuthRequest,
  token: string,
): Promise<QrChannelAuthResponse> {
  const response = await api.post(
    '/qr-orders/realtime/auth',
    qrChannelAuthRequestSchema.parse(input),
    {
      errorDisplay: 'inline',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return qrChannelAuthResponseSchema.parse(response.data);
}

export function usePushConfig(enabled: boolean): UseQueryResult<PushConfigResponse> {
  return useQuery({
    queryKey: [QrQueryKey.PushConfig],
    queryFn: async ({ signal }) =>
      pushConfigResponseSchema.parse(
        (await api.get('/push/config', { signal, errorDisplay: 'inline' })).data,
      ),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

export async function savePushSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  await api.post(
    '/push/subscriptions',
    { endpoint: subscription.endpoint, keys: subscription.keys },
    { errorDisplay: 'inline' },
  );
}
