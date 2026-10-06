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
import { useEffect } from 'react';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

import { TableStatusQueryKey } from '../types/TableStatusQueryKey';

const PAGE_SIZE = 100;

type UpdateTableStatusVariables = { id: string; input: UpdateTableStatusRequest };
type UpdateTableStatusActiveVariables = {
  id: string;
  input: UpdateTableStatusActiveRequest;
};

/** All table statuses, fetched page-by-page for the management list. */
export function useTableStatuses(enabled: boolean): UseQueryResult<TableStatus[]> {
  const showApiError = useShowApiError('Unable to load table statuses.');
  const query = useQuery({
    queryKey: [TableStatusQueryKey.TableStatuses],
    queryFn: async (): Promise<TableStatus[]> => {
      const firstResponse = await api.get('/table/statuses', {
        params: { page: 1, pageSize: PAGE_SIZE },
      });
      const firstPage = tableStatusListResponseSchema.parse(firstResponse.data);
      const statuses = [...firstPage.data];

      for (let page = 2; page <= firstPage.meta.totalPages; page += 1) {
        const response = await api.get('/table/statuses', {
          params: { page, pageSize: PAGE_SIZE },
        });
        statuses.push(...tableStatusListResponseSchema.parse(response.data).data);
      }

      return statuses;
    },
    enabled,
  });

  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, query.errorUpdatedAt, showApiError]);

  return query;
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
