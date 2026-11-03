import {
  type CreateBillCancellationReasonRequest,
  createBillCancellationReasonRequestSchema,
  deactivateBillCancellationReasonRequestSchema,
  type ManagedBillCancellationReason,
  type ManagedBillCancellationReasonListQuery,
  type ManagedBillCancellationReasonListResponse,
  managedBillCancellationReasonListResponseSchema,
  managedBillCancellationReasonSchema,
  type RenameBillCancellationReasonRequest,
  renameBillCancellationReasonRequestSchema,
} from '@rms/api-contract';
import {
  keepPreviousData,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

import { BILL_CANCELLATION_REASONS_QUERY_KEY } from './bills';

const MANAGEMENT_QUERY_KEY = 'bill-cancellation-reasons-management';
const endpoint = '/restaurant/settings/bill-cancellation-reasons';

export function useManagedBillCancellationReasons(
  query: ManagedBillCancellationReasonListQuery,
  enabled: boolean,
): UseQueryResult<ManagedBillCancellationReasonListResponse> {
  return useQuery({
    queryKey: [MANAGEMENT_QUERY_KEY, query],
    queryFn: async ({ signal }) => {
      const response = await api.get(endpoint, { params: query, signal, errorDisplay: 'inline' });
      return managedBillCancellationReasonListResponseSchema.parse(response.data);
    },
    enabled,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: keepPreviousData,
  });
}

function useReasonMutation<T>(
  request: (input: T) => Promise<ManagedBillCancellationReason>,
  successMessage: string,
): UseMutationResult<ManagedBillCancellationReason, Error, T> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to save the cancellation reason.');
  return useMutation<ManagedBillCancellationReason, Error, T>({
    mutationFn: request,
    onError: showApiError,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [MANAGEMENT_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [BILL_CANCELLATION_REASONS_QUERY_KEY] }),
      ]);
      toast.success(successMessage);
    },
  });
}

export function useCreateBillCancellationReason(): UseMutationResult<
  ManagedBillCancellationReason,
  Error,
  CreateBillCancellationReasonRequest
> {
  return useReasonMutation(async (input) => {
    const response = await api.post(
      endpoint,
      createBillCancellationReasonRequestSchema.parse(input),
    );
    return managedBillCancellationReasonSchema.parse(response.data);
  }, 'Bill cancellation reason added.');
}

export function useRenameBillCancellationReason(): UseMutationResult<
  ManagedBillCancellationReason,
  Error,
  { id: string; input: RenameBillCancellationReasonRequest }
> {
  return useReasonMutation(async ({ id, input }) => {
    const response = await api.patch(
      `${endpoint}/${id}`,
      renameBillCancellationReasonRequestSchema.parse(input),
    );
    return managedBillCancellationReasonSchema.parse(response.data);
  }, 'Bill cancellation reason saved.');
}

export function useDeactivateBillCancellationReason(): UseMutationResult<
  ManagedBillCancellationReason,
  Error,
  string
> {
  return useReasonMutation(async (id) => {
    const response = await api.patch(
      `${endpoint}/${id}/deactivate`,
      deactivateBillCancellationReasonRequestSchema.parse({}),
    );
    return managedBillCancellationReasonSchema.parse(response.data);
  }, 'Bill cancellation reason deactivated.');
}
