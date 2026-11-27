import {
  type AssignTableCaptainRequest,
  type AssignTablesCaptainRequest,
  type AssignTablesCaptainResponse,
  assignTablesCaptainResponseSchema,
  type CaptainOptionsResponse,
  captainOptionsResponseSchema,
  type CreateTableRequest,
  type CreateTableResponse,
  createTableResponseSchema,
  type RestaurantTable,
  restaurantTableSchema,
  type TableBoardResponse,
  tableBoardResponseSchema,
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
  type QueryClient,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';
import { BOARD_REFRESH_MS } from '@/lib/board-refresh';

import { QrQueryKey } from '../types/QrQueryKey';
import { TableQueryKey } from '../types/TableQueryKey';

type UpdateTableVariables = { id: string; input: UpdateTableRequest };
type UpdateTableActiveVariables = { id: string; input: UpdateTableActiveRequest };
type AssignTableCaptainVariables = { id: string; input: AssignTableCaptainRequest };

const BOARD_QUERY_KEY = [TableQueryKey.Tables, 'board'] as const;
const CAPTAINS_QUERY_KEY = [TableQueryKey.Tables, 'captains'] as const;

export function useCaptainOptions(enabled: boolean): UseQueryResult<CaptainOptionsResponse> {
  const showApiError = useShowApiError('Unable to load captains.');
  const query = useQuery({
    queryKey: CAPTAINS_QUERY_KEY,
    queryFn: async ({ signal }): Promise<CaptainOptionsResponse> => {
      const response = await api.get('/tables/captains', { signal });
      return captainOptionsResponseSchema.parse(response.data);
    },
    enabled,
  });

  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, showApiError]);

  return query;
}

/**
 * A table change (captain, active state, new table) also changes QR ordering state: floor markers,
 * no-captain alerts, the badge and the QR table cards (REST-88).
 */
function invalidateTablesAndQr(queryClient: QueryClient): Promise<unknown> {
  return Promise.all(
    [
      [TableQueryKey.Tables],
      [QrQueryKey.Floor],
      [QrQueryKey.Alerts],
      [QrQueryKey.Summary],
      [QrQueryKey.Cards],
      [QrQueryKey.Captains],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export function useAssignTableCaptain(): UseMutationResult<
  RestaurantTable,
  Error,
  AssignTableCaptainVariables
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to change the captain.');

  return useMutation<RestaurantTable, Error, AssignTableCaptainVariables>({
    mutationFn: async ({ id, input }): Promise<RestaurantTable> => {
      const response = await api.patch(`/tables/${id}/captain`, input);
      return restaurantTableSchema.parse(response.data);
    },
    onSuccess: () => invalidateTablesAndQr(queryClient),
    onError: showApiError,
  });
}

function replaceBoardRows(
  board: TableBoardResponse | undefined,
  patch: (table: RestaurantTable) => RestaurantTable,
): TableBoardResponse | undefined {
  return board && { ...board, data: board.data.map(patch) };
}

/**
 * Bulk captain change for the floor board (REST-99). The board updates optimistically; on success
 * it takes the server's rows (applied and conflicting), on failure it rolls back.
 */
export function useAssignTablesCaptain(): UseMutationResult<
  AssignTablesCaptainResponse,
  Error,
  AssignTablesCaptainRequest,
  { previous: TableBoardResponse | undefined }
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to change the captains.');

  return useMutation({
    mutationFn: async (input): Promise<AssignTablesCaptainResponse> => {
      const response = await api.patch('/tables/captain', input);
      return assignTablesCaptainResponseSchema.parse(response.data);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: BOARD_QUERY_KEY });
      const previous = queryClient.getQueryData<TableBoardResponse>(BOARD_QUERY_KEY);
      // Eligible captains plus current holders, so undo can restore a no-longer-listed captain.
      const captains = new Map(
        [
          ...(previous?.data.flatMap((table) => (table.captain ? [table.captain] : [])) ?? []),
          ...(queryClient.getQueryData<CaptainOptionsResponse>(CAPTAINS_QUERY_KEY) ?? []),
        ].map((captain) => [captain.id, captain]),
      );
      const targets = new Map(
        input.assignments.flatMap(({ captainUserId, tables }) =>
          tables.map(({ tableId }) => [tableId, captainUserId] as const),
        ),
      );
      queryClient.setQueryData<TableBoardResponse>(BOARD_QUERY_KEY, (board) =>
        replaceBoardRows(board, (table) => {
          if (!targets.has(table.id)) return table;
          const captainUserId = targets.get(table.id) ?? null;
          return {
            ...table,
            captainUserId,
            captain: captainUserId ? (captains.get(captainUserId) ?? null) : null,
          };
        }),
      );
      return { previous };
    },
    onSuccess: (result) => {
      const fresh = new Map([...result.updated, ...result.conflicts].map((t) => [t.id, t]));
      queryClient.setQueryData<TableBoardResponse>(BOARD_QUERY_KEY, (board) =>
        replaceBoardRows(board, (table) => fresh.get(table.id) ?? table),
      );
    },
    onError: (error, _input, context) => {
      queryClient.setQueryData(BOARD_QUERY_KEY, context?.previous);
      showApiError(error);
    },
    onSettled: () => invalidateTablesAndQr(queryClient),
  });
}

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

export function useTableBoard(enabled: boolean): UseQueryResult<TableBoardResponse> {
  return useQuery({
    queryKey: BOARD_QUERY_KEY,
    queryFn: async ({ signal }): Promise<TableBoardResponse> => {
      const response = await api.get('/tables/board', { signal });
      return tableBoardResponseSchema.parse(response.data);
    },
    enabled,
    refetchInterval: BOARD_REFRESH_MS,
  });
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
    onSuccess: () => invalidateTablesAndQr(queryClient),
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
    onSuccess: () => invalidateTablesAndQr(queryClient),
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
    onSuccess: () => invalidateTablesAndQr(queryClient),
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
    onSuccess: () => invalidateTablesAndQr(queryClient),
    onError: async (error) => {
      showApiError(error);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [TableQueryKey.Tables] }),
        queryClient.invalidateQueries({ queryKey: [TableQueryKey.Options] }),
      ]);
    },
  });
}
