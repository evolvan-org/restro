import {
  type MenuCategory,
  menuCategoryListResponseSchema,
  type MenuItemSearchResponse,
  menuItemSearchResponseSchema,
} from '@rms/api-contract';
import { DEFAULT_PAGE_SIZE } from '@rms/shared';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '@/lib/api';

import { MenuCategoryQueryKey } from '../types/MenuCategoryQueryKey';
import { MenuItemQueryKey } from '../types/MenuItemQueryKey';

export function useOrderingCategories(enabled: boolean): UseQueryResult<MenuCategory[]> {
  const query = useQuery({
    queryKey: [MenuCategoryQueryKey.Categories, 'ordering'],
    queryFn: async ({ signal }): Promise<MenuCategory[]> => {
      const response = await api.get('/menu-categories', {
        params: { activeOnly: true },
        signal,
        errorDisplay: 'inline',
      });
      return menuCategoryListResponseSchema.parse(response.data);
    },
    enabled,
    staleTime: 0,
  });
  return query;
}

/** Browse a bounded page using the existing server-side menu filters. */
export function useOrderingItems(
  categoryId: string,
  page: number,
  enabled: boolean,
): UseQueryResult<MenuItemSearchResponse> {
  return useQuery({
    queryKey: [MenuItemQueryKey.Items, 'ordering', categoryId, page],
    queryFn: async ({ signal }): Promise<MenuItemSearchResponse> => {
      const response = await api.get('/menu-items/search', {
        params: {
          activeOnly: true,
          categoryId: categoryId || undefined,
          page,
          pageSize: DEFAULT_PAGE_SIZE,
        },
        signal,
        errorDisplay: 'inline',
      });
      return menuItemSearchResponseSchema.parse(response.data);
    },
    enabled,
    staleTime: 0,
  });
}

export function useOrderingSearch(
  text: string,
  debouncedText: string,
  page: number,
  enabled: boolean,
): UseQueryResult<MenuItemSearchResponse> {
  const query = useQuery({
    // Including immediate input abandons the previous observer and aborts its consumed signal
    // immediately, before the next debounce finishes. Never show another search's old results.
    queryKey: [MenuItemQueryKey.Items, 'ordering-search', text, debouncedText, page],
    queryFn: async ({ signal }): Promise<MenuItemSearchResponse> => {
      const response = await api.get('/menu-items/search', {
        params: {
          q: debouncedText,
          activeOnly: true,
          isAvailable: true,
          page,
          pageSize: DEFAULT_PAGE_SIZE,
        },
        signal,
        errorDisplay: 'inline',
      });
      return menuItemSearchResponseSchema.parse(response.data);
    },
    enabled: enabled && text.length > 0 && text === debouncedText,
    staleTime: 0,
  });
  return query;
}
