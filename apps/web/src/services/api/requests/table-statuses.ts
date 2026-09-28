import {
  type CreateTableStatusRequest,
  type ReorderTableStatusesRequest,
  reorderTableStatusesResponseSchema,
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

import { api } from '@/lib/api';

import { TableStatusQueryKey } from '../types/TableStatusQueryKey';

const PAGE_SIZE = 100;

type UpdateTableStatusVariables = { id: string; input: UpdateTableStatusRequest };
type UpdateTableStatusActiveVariables = {
  id: string;
  input: UpdateTableStatusActiveRequest;
};

/** All table statuses, fetched page-by-page so reordering always submits a complete list. */
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
  });
}

export function useReorderTableStatuses(): UseMutationResult<
  TableStatus[],
  Error,
  ReorderTableStatusesRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input): Promise<TableStatus[]> => {
      const response = await api.patch('/table-statuses/reorder', input);
      return reorderTableStatusesResponseSchema.parse(response.data);
    },
    onSuccess: (statuses) => {
      queryClient.setQueryData([TableStatusQueryKey.TableStatuses], statuses);
    },
  });
}

export function useDeleteTableStatus(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id): Promise<void> => {
      await api.delete(`/table-statuses/${id}`);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [TableStatusQueryKey.TableStatuses] }),
  });
}
