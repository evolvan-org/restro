import {
  type AddFoodIncidentEntry,
  addFoodIncidentEntrySchema,
  type CreateFoodIncident,
  createFoodIncidentSchema,
  type FoodIncident,
  foodIncidentBatchOptionsSchema,
  foodIncidentBatchQuerySchema,
  foodIncidentHistorySchema,
  type FoodIncidentQuery,
  foodIncidentQuerySchema,
  foodIncidentSchema,
  foodIncidentsSchema,
  type ResolveFoodIncident,
  resolveFoodIncidentSchema,
} from '@rms/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

const root = 'food-incidents';
export function useFoodIncidentBatchOptions(page: number) {
  return useQuery({
    queryKey: [root, 'batch-options', page],
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) =>
      foodIncidentBatchOptionsSchema.parse(
        (
          await api.get('/food-incidents/batch-options', {
            params: foodIncidentBatchQuerySchema.parse({ page, pageSize: 20 }),
            signal,
          })
        ).data,
      ),
  });
}
const queryOptions = {
  retry: false,
  staleTime: 0,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;
export function useFoodIncidents(query: FoodIncidentQuery, enabled: boolean) {
  return useQuery({
    ...queryOptions,
    queryKey: [root, 'list', query],
    enabled,
    queryFn: async ({ signal }) =>
      foodIncidentsSchema.parse(
        (await api.get('/food-incidents', { params: foodIncidentQuerySchema.parse(query), signal }))
          .data,
      ),
  });
}
export function useFoodIncident(id: string) {
  return useQuery({
    ...queryOptions,
    queryKey: [root, 'detail', id],
    queryFn: async ({ signal }) =>
      foodIncidentSchema.parse((await api.get(`/food-incidents/${id}`, { signal })).data),
  });
}
export function useFoodIncidentHistory(id: string, page: number) {
  return useQuery({
    ...queryOptions,
    queryKey: [root, 'history', id, page],
    queryFn: async ({ signal }) =>
      foodIncidentHistorySchema.parse(
        (await api.get(`/food-incidents/${id}/history`, { params: { page, pageSize: 20 }, signal }))
          .data,
      ),
  });
}
export type IncidentCommand =
  | { action: 'create'; input: CreateFoodIncident }
  | { action: 'append'; id: string; input: AddFoodIncidentEntry }
  | { action: 'resolve'; id: string; input: ResolveFoodIncident };
export function useSaveFoodIncident() {
  const client = useQueryClient();
  const showApiError = useShowApiError('Unable to save the incident response.');
  return useMutation<FoodIncident, Error, IncidentCommand>({
    mutationFn: async (command) => {
      const response =
        command.action === 'create'
          ? await api.post('/food-incidents', createFoodIncidentSchema.parse(command.input))
          : command.action === 'append'
            ? await api.post(
                `/food-incidents/${command.id}/entries`,
                addFoodIncidentEntrySchema.parse(command.input),
              )
            : await api.post(
                `/food-incidents/${command.id}/resolve`,
                resolveFoodIncidentSchema.parse(command.input),
              );
      return foodIncidentSchema.parse(response.data);
    },
    onError: showApiError,
    onSuccess: async (record) => {
      client.setQueryData([root, 'detail', record.id], record);
      await Promise.all([
        client.invalidateQueries({ queryKey: [root, 'list'] }),
        client.invalidateQueries({ queryKey: [root, 'history', record.id] }),
      ]);
    },
  });
}
