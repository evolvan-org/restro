import {
  type MarkNotificationsReadResponse,
  markNotificationsReadResponseSchema,
  type NotificationChannelAuthRequest,
  notificationChannelAuthRequestSchema,
  type NotificationChannelAuthResponse,
  notificationChannelAuthResponseSchema,
  type NotificationListResponse,
  notificationListResponseSchema,
  type NotificationRealtimeConfig,
  notificationRealtimeConfigSchema,
  type Order,
  orderSchema,
  type Reservation,
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

import { NotificationQueryKey } from '../types/NotificationQueryKey';
import { getReservation } from './reservations';

const userActionQueryOptions = {
  staleTime: Infinity,
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

export function useNotifications(): UseQueryResult<NotificationListResponse> {
  const token = useAccessToken();
  return useQuery({
    queryKey: [NotificationQueryKey.List],
    queryFn: async ({ signal }): Promise<NotificationListResponse> => {
      const response = await api.get('/notifications', {
        params: { page: 1, pageSize: 20 },
        signal,
        errorDisplay: 'inline',
        // Restored sessions can mount before useSetupAxios installs its effect-based interceptor.
        headers: { Authorization: `Bearer ${token}` },
      });
      return notificationListResponseSchema.parse(response.data);
    },
    enabled: Boolean(token),
    ...userActionQueryOptions,
  });
}

export function useNotificationRealtime(): UseQueryResult<NotificationRealtimeConfig> {
  const token = useAccessToken();
  return useQuery({
    queryKey: [NotificationQueryKey.Realtime],
    queryFn: async ({ signal }): Promise<NotificationRealtimeConfig> => {
      const response = await api.get('/notifications/realtime', {
        signal,
        errorDisplay: 'inline',
        headers: { Authorization: `Bearer ${token}` },
      });
      return notificationRealtimeConfigSchema.parse(response.data);
    },
    enabled: Boolean(token),
    ...userActionQueryOptions,
  });
}

export async function authorizeNotificationChannel(
  input: NotificationChannelAuthRequest,
  token: string,
): Promise<NotificationChannelAuthResponse> {
  const response = await api.post(
    '/notifications/auth',
    notificationChannelAuthRequestSchema.parse(input),
    { errorDisplay: 'inline', headers: { Authorization: `Bearer ${token}` } },
  );
  return notificationChannelAuthResponseSchema.parse(response.data);
}

/** An omitted ID marks all alerts read; both operations share the same error ownership. */
export function useMarkNotificationsRead(): UseMutationResult<
  MarkNotificationsReadResponse,
  Error,
  string | undefined
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to mark notifications as read.');
  return useMutation<MarkNotificationsReadResponse, Error, string | undefined>({
    mutationFn: async (id: string | undefined): Promise<MarkNotificationsReadResponse> => {
      const response = await api.patch(
        id ? `/notifications/${id}/read` : '/notifications/read-all',
      );
      return markNotificationsReadResponseSchema.parse(response.data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [NotificationQueryKey.List] });
    },
    onError: showApiError,
  });
}

/** Resolves an existing reservation only after an explicit notification click. */
export function useNotificationReservation(): UseMutationResult<Reservation, Error, string> {
  const showApiError = useShowApiError('Unable to open the reservation.');
  return useMutation<Reservation, Error, string>({
    mutationFn: getReservation,
    onError: showApiError,
  });
}

/** Do not let an old alert open a different order that later occupied the same table. */
export function useNotificationOrder(): UseMutationResult<
  Order,
  Error,
  { tableId: string; orderId: string }
> {
  const showApiError = useShowApiError(
    'This order is no longer active, or it could not be opened.',
  );
  return useMutation<Order, Error, { tableId: string; orderId: string }>({
    mutationFn: async ({ tableId, orderId }): Promise<Order> => {
      const response = await api.get('/orders/current', { params: { tableId } });
      const order = orderSchema.parse(response.data);
      if (order.id !== orderId) throw new Error('This order is no longer active for this table.');
      return order;
    },
    onError: showApiError,
  });
}
