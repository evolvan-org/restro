import {
  type CreateTableStatusRequest,
  type TableStatus,
  tableStatusListResponseSchema,
  tableStatusSchema,
  type UpdateTableStatusActiveRequest,
  type UpdateTableStatusRequest,
} from '@rms/api-contract';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/api-error';

import { TableStatusQueryKey } from '../types/TableStatusQueryKey';

const PAGE_SIZE = 100;

function showMutationError(error: Error, fallback: string): void {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  // The shared interceptor already handles authentication, forbidden, and server errors.
  if (status === 401 || status === 403 || (status !== undefined && status >= 500)) return;
  toast.error(getApiErrorMessage(error, fallback));
}

type UpdateTableStatusVariables = { id: string; input: UpdateTableStatusRequest };
type UpdateTableStatusActiveVariables = {
  id: string;
  input: UpdateTableStatusActiveRequest;
};

/** All table statuses, fetched page-by-page for the management list. */
export function useTableStatuses(enabled: boolean): UseQueryResult<TableStatus[]> {
  return useQuery({
    queryKey: [TableStatusQueryKey.TableStatuses],
    queryFn: async (): Promise<TableStatus[]> => {
      const firstResponse = await api.get('/table-statuses', {
        params: { page: 1, pageSize: PAGE_SIZE },
      });
      const firstPage = tableStatusListResponseSchema.parse(firstResponse.data);
      const statuses = [...firstPage.data];

      for (let page = 2; page <= firstPage.meta.totalPages; page += 1) {
        const response = await api.get('/table-statuses', {
          params: { page, pageSize: PAGE_SIZE },
        });
        statuses.push(...tableStatusListResponseSchema.parse(response.data).data);
      }

      return statuses;
    },
    enabled,
  });
}

export function useCreateTableStatus(): UseMutationResult<
  TableStatus,
  Error,
  CreateTableStatusRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input): Promise<TableStatus> => {
      const response = await api.post('/table-statuses', input);
      return tableStatusSchema.parse(response.data);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [TableStatusQueryKey.TableStatuses] }),
    onError: (error) => showMutationError(error, 'Unable to create the table status.'),
  });
}

export function useUpdateTableStatus(): UseMutationResult<
  TableStatus,
  Error,
  UpdateTableStatusVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }): Promise<TableStatus> => {
      const response = await api.patch(`/table-statuses/${id}`, input);
      return tableStatusSchema.parse(response.data);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [TableStatusQueryKey.TableStatuses] }),
    onError: (error) => showMutationError(error, 'Unable to update the table status.'),
  });
}

export function useUpdateTableStatusActive(): UseMutationResult<
  TableStatus,
  Error,
  UpdateTableStatusActiveVariables
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }): Promise<TableStatus> => {
      const response = await api.patch(`/table-statuses/${id}/status`, input);
      return tableStatusSchema.parse(response.data);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [TableStatusQueryKey.TableStatuses] }),
    onError: (error) => showMutationError(error, 'Unable to change the status.'),
  });
}

export function useArchiveTableStatus(): UseMutationResult<TableStatus, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id): Promise<TableStatus> => {
      const response = await api.patch(`/table-statuses/${id}/archive`);
      return tableStatusSchema.parse(response.data);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [TableStatusQueryKey.TableStatuses] }),
    onError: (error) => showMutationError(error, 'Unable to archive the table status.'),
  });
}
