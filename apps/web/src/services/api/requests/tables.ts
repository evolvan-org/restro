import {
  type CreateTableRequest,
  type CreateTableResponse,
  createTableResponseSchema,
  type RestaurantTable,
  restaurantTableSchema,
  type TableListQuery,
  type TableListResponse,
  tableListResponseSchema,
  type TableOptionsResponse,
  tableOptionsResponseSchema,
  type TransitionTableStatusRequest,
  type UpdateTableActiveRequest,
  type UpdateTableRequest,
} from '@rms/api-contract';
import { MAX_PAGE_SIZE } from '@rms/shared';
import {
  keepPreviousData,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

import { TableQueryKey } from '../types/TableQueryKey';

type UpdateTableVariables = { id: string; input: UpdateTableRequest };
type UpdateTableActiveVariables = { id: string; input: UpdateTableActiveRequest };

/** Load every active-table page so the picker cannot silently omit later tables. */
export function useAssignableTables(enabled: boolean): UseQueryResult<RestaurantTable[]> {
  const showApiError = useShowApiError('Unable to load tables for assignment.');
  const query = useQuery({
    queryKey: [TableQueryKey.Tables, 'assignment'],
    queryFn: async ({ signal }): Promise<RestaurantTable[]> => {
      const tables: RestaurantTable[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await api.get('/tables', {
          params: { isActive: true, page, pageSize: MAX_PAGE_SIZE },
          signal,
        });
        const result = tableListResponseSchema.parse(response.data);
        tables.push(...result.data);
        totalPages = result.meta.totalPages;
        page += 1;
      } while (page <= totalPages);
      return tables;
    },
    enabled,
  });

  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, showApiError]);

  return query;
}

export function useTableList(
  query: TableListQuery,
  enabled: boolean,
  refetchInterval?: number,
): UseQueryResult<TableListResponse> {
  return useQuery({
    queryKey: [TableQueryKey.Tables, query],
    queryFn: async (): Promise<TableListResponse> => {
      const response = await api.get('/tables', { params: query });
      return tableListResponseSchema.parse(response.data);
    },
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval,
  });
}

export function useTableOptions(enabled: boolean): UseQueryResult<TableOptionsResponse> {
  return useQuery({
    queryKey: [TableQueryKey.Options],
    queryFn: async (): Promise<TableOptionsResponse> => {
      const response = await api.get('/tables/options');
      return tableOptionsResponseSchema.parse(response.data);
    },
    enabled,
  });
}

export async function getTable(id: string): Promise<RestaurantTable> {
  const response = await api.get(`/table/${id}`);
  return restaurantTableSchema.parse(response.data);
}

export function useCreateTable(): UseMutationResult<
  CreateTableResponse,
  Error,
  CreateTableRequest
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to create the table.');

  return useMutation<CreateTableResponse, Error, CreateTableRequest>({
    mutationFn: async (input: CreateTableRequest): Promise<CreateTableResponse> => {
      const response = await api.post('/tables', input);
      return createTableResponseSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
    onError: showApiError,
  });
}

export function useUpdateTable(): UseMutationResult<RestaurantTable, Error, UpdateTableVariables> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to update the table.');

  return useMutation<RestaurantTable, Error, UpdateTableVariables>({
    mutationFn: async ({ id, input }: UpdateTableVariables): Promise<RestaurantTable> => {
      const response = await api.patch(`/table/${id}`, input);
      return restaurantTableSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
    onError: showApiError,
  });
}

export function useUpdateTableActive(): UseMutationResult<
  RestaurantTable,
  Error,
  UpdateTableActiveVariables
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to change the table state.');

  return useMutation<RestaurantTable, Error, UpdateTableActiveVariables>({
    mutationFn: async ({ id, input }: UpdateTableActiveVariables): Promise<RestaurantTable> => {
      const response = await api.patch(`/table/${id}/active`, input);
      return restaurantTableSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
    onError: showApiError,
  });
}

type TransitionTableStatusVariables = { id: string; input: TransitionTableStatusRequest };

export function useTransitionTableStatus(): UseMutationResult<
  RestaurantTable,
  Error,
  TransitionTableStatusVariables
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to change the table status.');
  return useMutation<RestaurantTable, Error, TransitionTableStatusVariables>({
    mutationFn: async ({ id, input }): Promise<RestaurantTable> => {
      const response = await api.patch(`/tables/${id}/status`, input);
      return restaurantTableSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
    onError: async (error) => {
      showApiError(error);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
        queryClient.invalidateQueries({ queryKey: [TableQueryKey.Options] }),
      ]);
    },
  });
}
