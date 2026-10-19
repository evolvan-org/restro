import {
  type CreateMenuCategoryRequest,
  type MenuCategory,
  menuCategoryListResponseSchema,
  menuCategorySchema,
  type ReorderMenuCategoriesRequest,
  type ReorderMenuCategoriesResponse,
  reorderMenuCategoriesResponseSchema,
  type UpdateMenuCategoryRequest,
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

import { MenuCategoryQueryKey } from '../types/MenuCategoryQueryKey';

type UpdateVariables = { id: string; input: UpdateMenuCategoryRequest };

/** The list is never cached stale: edits must be visible on the very next read. */
export function useMenuCategories(enabled: boolean): UseQueryResult<MenuCategory[]> {
  return useQuery({
    queryKey: [MenuCategoryQueryKey.Categories],
    queryFn: async (): Promise<MenuCategory[]> => {
      const response = await api.get('/menu-categories');
      return menuCategoryListResponseSchema.parse(response.data);
    },
    enabled,
    staleTime: 0,
  });
}

export function useCreateMenuCategory(): UseMutationResult<
  MenuCategory,
  Error,
  CreateMenuCategoryRequest
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to create the menu category.');
  return useMutation<MenuCategory, Error, CreateMenuCategoryRequest>({
    mutationFn: async (input): Promise<MenuCategory> => {
      const response = await api.post('/menu-categories', input);
      return menuCategorySchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MenuCategoryQueryKey.Categories] }),
    onError: showApiError,
  });
}

export function useUpdateMenuCategory(): UseMutationResult<MenuCategory, Error, UpdateVariables> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to update the menu category.');
  return useMutation<MenuCategory, Error, UpdateVariables>({
    mutationFn: async ({ id, input }): Promise<MenuCategory> => {
      const response = await api.patch(`/menu-categories/${id}`, input);
      return menuCategorySchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MenuCategoryQueryKey.Categories] }),
    onError: showApiError,
  });
}

export function useReorderMenuCategories(): UseMutationResult<
  ReorderMenuCategoriesResponse,
  Error,
  ReorderMenuCategoriesRequest
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to save the new category order.');
  return useMutation<ReorderMenuCategoriesResponse, Error, ReorderMenuCategoriesRequest>({
    mutationFn: async (input): Promise<ReorderMenuCategoriesResponse> => {
      const response = await api.patch('/menu-categories/reorder', input);
      return reorderMenuCategoriesResponseSchema.parse(response.data);
    },
    onSuccess: (categories) => {
      queryClient.setQueryData([MenuCategoryQueryKey.Categories], categories);
    },
    onError: showApiError,
  });
}
