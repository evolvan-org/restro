import {
  type CreateMenuItemRequest,
  type MenuItem,
  type MenuItemListQuery,
  menuItemListQuerySchema,
  menuItemListResponseSchema,
  menuItemSchema,
  type MenuItemSearchQuery,
  type MenuItemSearchResponse,
  menuItemSearchResponseSchema,
  type StockItem,
  stockItemListResponseSchema,
  type UpdateMenuItemAvailabilityRequest,
  updateMenuItemAvailabilityRequestSchema,
  type UpdateMenuItemClassificationRequest,
  updateMenuItemClassificationRequestSchema,
  type UpdateMenuItemPriceRequest,
  updateMenuItemPriceRequestSchema,
  type UpdateMenuItemRequest,
} from '@rms/api-contract';
import {
  keepPreviousData,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

import { MenuItemQueryKey } from '../types/MenuItemQueryKey';

type UpdateVariables = { id: string; input: UpdateMenuItemRequest };
type AvailabilityVariables = { id: string; input: UpdateMenuItemAvailabilityRequest };
type PriceVariables = { id: string; input: UpdateMenuItemPriceRequest };
type ClassificationVariables = { id: string; input: UpdateMenuItemClassificationRequest };

/** Lists active items with their recipes. Never cached stale: edits show on the next read. */
export function useMenuItems(
  query: MenuItemListQuery,
  enabled: boolean,
): UseQueryResult<MenuItem[]> {
  return useQuery({
    queryKey: [MenuItemQueryKey.Items, query.categoryId ?? 'all', query.itemType ?? 'all'],
    queryFn: async ({ signal }): Promise<MenuItem[]> => {
      const response = await api.get('/menu-items', {
        params: menuItemListQuerySchema.parse(query),
        signal,
      });
      return menuItemListResponseSchema.parse(response.data);
    },
    enabled,
    staleTime: 0,
  });
}

/** Debounced search + filters, paginated; keeps the previous page visible while the next loads. */
export function useMenuItemSearch(
  query: MenuItemSearchQuery,
  enabled: boolean,
): UseQueryResult<MenuItemSearchResponse> {
  return useQuery({
    queryKey: [MenuItemQueryKey.Items, 'search', query],
    queryFn: async (): Promise<MenuItemSearchResponse> => {
      const response = await api.get('/menu-items/search', { params: query });
      return menuItemSearchResponseSchema.parse(response.data);
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** The seeded ingredient feeds the recipe picker. */
export function useStockItems(enabled: boolean): UseQueryResult<StockItem[]> {
  return useQuery({
    queryKey: [MenuItemQueryKey.StockItems],
    queryFn: async (): Promise<StockItem[]> => {
      const response = await api.get('/stock-items');
      return stockItemListResponseSchema.parse(response.data);
    },
    enabled,
    staleTime: 0,
  });
}

export function useCreateMenuItem(): UseMutationResult<MenuItem, Error, CreateMenuItemRequest> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to create the menu item.');
  return useMutation<MenuItem, Error, CreateMenuItemRequest>({
    mutationFn: async (input): Promise<MenuItem> => {
      const response = await api.post('/menu-items', input);
      return menuItemSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MenuItemQueryKey.Items] }),
    onError: showApiError,
  });
}

export function useUpdateMenuItem(): UseMutationResult<MenuItem, Error, UpdateVariables> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to update the menu item.');
  return useMutation<MenuItem, Error, UpdateVariables>({
    mutationFn: async ({ id, input }): Promise<MenuItem> => {
      const response = await api.patch(`/menu-items/${id}`, input);
      return menuItemSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MenuItemQueryKey.Items] }),
    onError: showApiError,
  });
}

export function useUpdateMenuItemAvailability(): UseMutationResult<
  MenuItem,
  Error,
  AvailabilityVariables
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to update item availability.');
  return useMutation<MenuItem, Error, AvailabilityVariables>({
    mutationFn: async ({ id, input }): Promise<MenuItem> => {
      const response = await api.patch(
        `/menu-items/${id}/availability`,
        updateMenuItemAvailabilityRequestSchema.parse(input),
      );
      return menuItemSchema.parse(response.data);
    },
    onSuccess: async (updated): Promise<void> => {
      // Stop an earlier list request from overwriting the confirmed availability.
      await queryClient.cancelQueries({ queryKey: [MenuItemQueryKey.Items] });
      queryClient.setQueriesData<MenuItem[]>({ queryKey: [MenuItemQueryKey.Items] }, (items) =>
        items?.map((item) => (item.id === updated.id ? updated : item)),
      );
      await queryClient.invalidateQueries({ queryKey: [MenuItemQueryKey.Items] });
    },
    onError: showApiError,
  });
}

export function useUpdateMenuItemPrice(): UseMutationResult<MenuItem, Error, PriceVariables> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to update the item price.');
  return useMutation<MenuItem, Error, PriceVariables>({
    mutationFn: async ({ id, input }): Promise<MenuItem> => {
      const response = await api.patch(
        `/menu-items/${id}/price`,
        updateMenuItemPriceRequestSchema.parse(input),
      );
      return menuItemSchema.parse(response.data);
    },
    onSuccess: async (updated): Promise<void> => {
      // Keep all category variants current and prevent older list responses from replacing the price.
      await queryClient.cancelQueries({ queryKey: [MenuItemQueryKey.Items] });
      queryClient.setQueriesData<MenuItem[]>({ queryKey: [MenuItemQueryKey.Items] }, (items) =>
        items?.map((item) => (item.id === updated.id ? updated : item)),
      );
      await queryClient.invalidateQueries({ queryKey: [MenuItemQueryKey.Items] });
    },
    onError: showApiError,
  });
}

export function useUpdateMenuItemClassification(): UseMutationResult<
  MenuItem,
  Error,
  ClassificationVariables
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to update item classification.');
  return useMutation<MenuItem, Error, ClassificationVariables>({
    mutationFn: async ({ id, input }): Promise<MenuItem> => {
      const response = await api.patch(
        `/menu-items/${id}/classification`,
        updateMenuItemClassificationRequestSchema.parse(input),
      );
      return menuItemSchema.parse(response.data);
    },
    onSuccess: async (updated): Promise<void> => {
      await queryClient.cancelQueries({ queryKey: [MenuItemQueryKey.Items] });
      for (const [queryKey, items] of queryClient.getQueriesData<MenuItem[]>({
        queryKey: [MenuItemQueryKey.Items],
      })) {
        if (!items) continue;
        const matchesCategory = queryKey[1] === 'all' || queryKey[1] === updated.categoryId;
        // Two-part keys from an existing session represent the unfiltered type list.
        const matchesType =
          queryKey[2] === undefined || queryKey[2] === 'all' || queryKey[2] === updated.itemType;
        const next =
          matchesCategory && matchesType
            ? items.map((item) => (item.id === updated.id ? updated : item))
            : items.filter((item) => item.id !== updated.id);
        queryClient.setQueryData(queryKey, next);
      }
      // Fetch newly matching rows in database order, including cached inactive filter variants.
      await queryClient.invalidateQueries({
        queryKey: [MenuItemQueryKey.Items],
        refetchType: 'all',
      });
    },
    onError: showApiError,
  });
}

export function useDeleteMenuItem(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to delete the menu item.');
  return useMutation<void, Error, string>({
    mutationFn: async (id): Promise<void> => {
      await api.delete(`/menu-items/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MenuItemQueryKey.Items] }),
    onError: showApiError,
  });
}
