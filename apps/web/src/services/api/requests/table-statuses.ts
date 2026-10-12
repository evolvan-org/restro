import {
  type CreateTableStatusRequest,
  type TableStatus,
  type TableStatusListResponse,
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

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

import { TableStatusQueryKey } from '../types/TableStatusQueryKey';

const PAGE_SIZE = 100;

type UpdateTableStatusVariables = { id: string; input: UpdateTableStatusRequest };
type UpdateTableStatusActiveVariables = {
  id: string;
  input: UpdateTableStatusActiveRequest;
};

/**
 * All table statuses for the management list. Statuses are a small, bounded configuration set, so
 * the whole list is loaded: page 1 first, then any remaining pages in parallel.
 */
export function useTableStatuses(enabled: boolean): UseQueryResult<TableStatus[]> {
  return useQuery({
    queryKey: [TableStatusQueryKey.TableStatuses],
    queryFn: async (): Promise<TableStatus[]> => {
      const fetchPage = async (page: number): Promise<TableStatusListResponse> => {
        const response = await api.get('/table/statuses', {
          params: { page, pageSize: PAGE_SIZE },
        });
        return tableStatusListResponseSchema.parse(response.data);
      };

      const firstPage = await fetchPage(1);
      const remainingPages = await Promise.all(
        Array.from({ length: Math.max(firstPage.meta.totalPages - 1, 0) }, (_, index) =>
          fetchPage(index + 2),
        ),
      );

      return [firstPage, ...remainingPages].flatMap((page) => page.data);
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
  const showApiError = useShowApiError('Unable to create the table status.');
  return useMutation<TableStatus, Error, CreateTableStatusRequest>({
    mutationFn: async (input): Promise<TableStatus> => {
      const response = await api.post('/table/statuses', input);
      return tableStatusSchema.parse(response.data);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [TableStatusQueryKey.TableStatuses] }),
    onError: showApiError,
  });
}

export function useUpdateTableStatus(): UseMutationResult<
  TableStatus,
  Error,
  UpdateTableStatusVariables
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to update the table status.');
  return useMutation<TableStatus, Error, UpdateTableStatusVariables>({
    mutationFn: async ({ id, input }): Promise<TableStatus> => {
      const response = await api.patch(`/table/statuses/${id}`, input);
      return tableStatusSchema.parse(response.data);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [TableStatusQueryKey.TableStatuses] }),
    onError: showApiError,
  });
}

export function useUpdateTableStatusActive(): UseMutationResult<
  TableStatus,
  Error,
  UpdateTableStatusActiveVariables
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to change the status.');
  return useMutation<TableStatus, Error, UpdateTableStatusActiveVariables>({
    mutationFn: async ({ id, input }): Promise<TableStatus> => {
      const response = await api.patch(`/table/statuses/${id}/status`, input);
      return tableStatusSchema.parse(response.data);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [TableStatusQueryKey.TableStatuses] }),
    onError: showApiError,
  });
}

export function useArchiveTableStatus(): UseMutationResult<TableStatus, Error, string> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to archive the table status.');
  return useMutation<TableStatus, Error, string>({
    mutationFn: async (id): Promise<TableStatus> => {
      const response = await api.patch(`/table/statuses/${id}/archive`);
      return tableStatusSchema.parse(response.data);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [TableStatusQueryKey.TableStatuses] }),
    onError: showApiError,
  });
}
