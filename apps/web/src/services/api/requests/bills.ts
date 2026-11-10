import {
  type Bill,
  type BillCancellationReasonsResponse,
  billCancellationReasonsResponseSchema,
  type BillInvoice,
  billInvoiceSchema,
  type BillListQuery,
  type BillListResponse,
  billListResponseSchema,
  billSchema,
  type CancelBillRequest,
  cancelBillRequestSchema,
  generateBillRequestSchema,
  type RecordPaymentRequest,
  recordPaymentRequestSchema,
  type RecordPaymentResponse,
  recordPaymentResponseSchema,
  type UpdateBillRequest,
  updateBillRequestSchema,
} from '@rms/api-contract';
import {
  keepPreviousData,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import axios from 'axios';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

import { OrderQueryKey } from '../types/OrderQueryKey';
import { ReservationQueryKey } from '../types/ReservationQueryKey';
import { TableQueryKey } from '../types/TableQueryKey';

export const BILL_QUERY_KEY = 'bills';
export const BILL_CANCELLATION_REASONS_QUERY_KEY = 'bill-cancellation-reasons';

export function useBillCancellationReasons(
  enabled: boolean,
): UseQueryResult<BillCancellationReasonsResponse> {
  return useQuery({
    queryKey: [BILL_CANCELLATION_REASONS_QUERY_KEY],
    queryFn: async ({ signal }) => {
      const response = await api.get('/bills/cancellation-reasons', {
        signal,
        errorDisplay: 'inline',
      });
      return billCancellationReasonsResponseSchema.parse(response.data);
    },
    enabled,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useBills(query: BillListQuery, enabled: boolean): UseQueryResult<BillListResponse> {
  return useQuery({
    queryKey: [BILL_QUERY_KEY, 'list', query],
    queryFn: async ({ signal }) => {
      const response = await api.get('/bills', { params: query, signal, errorDisplay: 'inline' });
      return billListResponseSchema.parse(response.data);
    },
    enabled,
    retry: false,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useBill(id: string, enabled: boolean): UseQueryResult<Bill> {
  return useQuery({
    queryKey: [BILL_QUERY_KEY, 'detail', id],
    queryFn: async ({ signal }) => {
      const response = await api.get(`/bills/${id}`, { signal, errorDisplay: 'inline' });
      return billSchema.parse(response.data);
    },
    enabled,
    retry: false,
    staleTime: 0,
  });
}

export function useOrderBill(
  orderId: string | undefined,
  enabled: boolean,
): UseQueryResult<Bill | null> {
  return useQuery({
    queryKey: [BILL_QUERY_KEY, 'order', orderId],
    queryFn: async ({ signal }) => {
      try {
        const response = await api.get(`/orders/${orderId}/bill`, {
          signal,
          errorDisplay: 'inline',
        });
        return billSchema.parse(response.data);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
      }
    },
    enabled: enabled && Boolean(orderId),
    retry: false,
    staleTime: 0,
  });
}

export function useBillInvoice(id: string, enabled: boolean): UseQueryResult<BillInvoice> {
  return useQuery({
    queryKey: [BILL_QUERY_KEY, 'invoice', id],
    queryFn: async ({ signal }) => {
      const response = await api.get(`/bills/${id}/invoice`, { signal, errorDisplay: 'inline' });
      return billInvoiceSchema.parse(response.data);
    },
    enabled,
    retry: false,
    staleTime: 0,
  });
}

function useBillMutation<T>(
  request: (input: T) => Promise<Bill>,
): UseMutationResult<Bill, Error, T> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to save the bill.');
  return useMutation<Bill, Error, T>({
    mutationFn: request,
    onError: showApiError,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [BILL_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
        queryClient.invalidateQueries({ queryKey: [ReservationQueryKey.Reservations] }),
      ]);
    },
  });
}

export function useGenerateBill(): UseMutationResult<Bill, Error, string> {
  return useBillMutation(async (orderId) => {
    const response = await api.post(`/orders/${orderId}/bill`, generateBillRequestSchema.parse({}));
    return billSchema.parse(response.data);
  });
}

export function useUpdateBill(): UseMutationResult<
  Bill,
  Error,
  { id: string; input: UpdateBillRequest }
> {
  return useBillMutation(async ({ id, input }) => {
    const response = await api.patch(`/bills/${id}`, updateBillRequestSchema.parse(input));
    return billSchema.parse(response.data);
  });
}

export function useCancelBill(): UseMutationResult<
  Bill,
  Error,
  { id: string; input: CancelBillRequest }
> {
  return useBillMutation(async ({ id, input }) => {
    const response = await api.patch(`/bills/${id}/cancel`, cancelBillRequestSchema.parse(input));
    return billSchema.parse(response.data);
  });
}

export function useRecordPayment(): UseMutationResult<
  RecordPaymentResponse,
  Error,
  { id: string; input: RecordPaymentRequest }
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to record the payment.');
  return useMutation<RecordPaymentResponse, Error, { id: string; input: RecordPaymentRequest }>({
    mutationFn: async ({ id, input }) => {
      const response = await api.post(
        `/bills/${id}/payments`,
        recordPaymentRequestSchema.parse(input),
      );
      return recordPaymentResponseSchema.parse(response.data);
    },
    onError: showApiError,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [BILL_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
        queryClient.invalidateQueries({ queryKey: [OrderQueryKey.Current] }),
        queryClient.invalidateQueries({ queryKey: [OrderQueryKey.Reservations] }),
        queryClient.invalidateQueries({ queryKey: [ReservationQueryKey.Reservations] }),
      ]);
    },
  });
}
