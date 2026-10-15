import {
  type CreateMenuItemRequest,
  type MenuItem,
  type MenuItemListQuery,
  type MenuItemListResponse,
  menuItemListResponseSchema,
  menuItemSchema,
  type StockItem,
  stockItemListResponseSchema,
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

/** One page of items (active and inactive); the previous page stays visible while the next loads. */
export function useMenuItems(
  query: Pick<MenuItemListQuery, 'page' | 'pageSize' | 'categoryId'>,
  enabled: boolean,
): UseQueryResult<MenuItemListResponse> {
  return useQuery({
    queryKey: [MenuItemQueryKey.Items, query],
    queryFn: async (): Promise<MenuItemListResponse> => {
      const response = await api.get('/menu-items', { params: query });
      return menuItemListResponseSchema.parse(response.data);
    },
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 0,
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
