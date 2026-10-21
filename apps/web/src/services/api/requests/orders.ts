import {
  type CreateOrderRequest,
  createOrderRequestSchema,
  type Order,
  orderAlreadyOpenErrorSchema,
  orderSchema,
  type Reservation,
  reservationListResponseSchema,
  type RestaurantTable,
  restaurantTableSchema,
} from '@rms/api-contract';
import { MAX_PAGE_SIZE } from '@rms/shared';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import axios from 'axios';
import { useEffect } from 'react';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

import { OrderQueryKey } from '../types/OrderQueryKey';
import { TableQueryKey } from '../types/TableQueryKey';

export function useOrderingTable(
  tableId: string,
  enabled: boolean,
): UseQueryResult<RestaurantTable> {
  const showApiError = useShowApiError('Unable to load this table.');
  const query = useQuery({
    queryKey: [TableQueryKey.Tables, 'ordering', tableId],
    queryFn: async ({ signal }): Promise<RestaurantTable> => {
      const response = await api.get(`/table/${tableId}`, { signal });
      return restaurantTableSchema.parse(response.data);
    },
    enabled,
    retry: false,
  });
  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, showApiError]);
  return query;
}

export function useCurrentOrder(tableId: string, enabled: boolean): UseQueryResult<Order | null> {
  const showApiError = useShowApiError('Unable to load the table order.');
  const query = useQuery({
    queryKey: [OrderQueryKey.Current, tableId],
    queryFn: async ({ signal }): Promise<Order | null> => {
      try {
        const response = await api.get('/orders/current', { params: { tableId }, signal });
        return orderSchema.parse(response.data);
      } catch (error) {
        // No open order is an expected state on a table's first visit.
        if (axios.isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
      }
    },
    enabled,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, showApiError]);
  return query;
}

export function useOpenOrder(): UseMutationResult<Order, Error, CreateOrderRequest> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to open the order.');
  return useMutation<Order, Error, CreateOrderRequest>({
    mutationFn: async (input: CreateOrderRequest): Promise<Order> => {
      try {
        const response = await api.post('/orders', createOrderRequestSchema.parse(input));
        return orderSchema.parse(response.data);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          const conflict = orderAlreadyOpenErrorSchema.safeParse(error.response.data);
          if (conflict.success) return conflict.data.existingOrder;
        }
        throw error;
      }
    },
    onSuccess: async (order) => {
      const queryKey = [OrderQueryKey.Current, order.tableId];
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, order);
    },
    onError: showApiError,
  });
}

/** Optional reservation selection must include later pages, not just the first 20 records. */
export function useOrderReservations(
  tableId: string,
  enabled: boolean,
): UseQueryResult<Reservation[]> {
  const showApiError = useShowApiError('Unable to load reservations for this table.');
  const query = useQuery({
    queryKey: [OrderQueryKey.Reservations, tableId],
    queryFn: async ({ signal }): Promise<Reservation[]> => {
      const reservations: Reservation[] = [];
      for (const status of ['BOOKED', 'SEATED'] as const) {
        let page = 1;
        let totalPages = 1;
        do {
          const response = await api.get('/reservations', {
            params: { status, page, pageSize: MAX_PAGE_SIZE },
            signal,
          });
          const result = reservationListResponseSchema.parse(response.data);
          reservations.push(...result.data.filter((item) => item.tableId === tableId));
          totalPages = result.meta.totalPages;
          page += 1;
        } while (page <= totalPages);
      }
      return reservations;
    },
    enabled,
    staleTime: 0,
  });

  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, showApiError]);
  return query;
}
