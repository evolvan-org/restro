import {
  type MenuCategory,
  menuCategoryListResponseSchema,
  type MenuItem,
  menuItemListResponseSchema,
  type MenuItemSearchResponse,
  menuItemSearchResponseSchema,
} from '@rms/api-contract';
import { DEFAULT_PAGE_SIZE } from '@rms/shared';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

import { MenuCategoryQueryKey } from '../types/MenuCategoryQueryKey';
import { MenuItemQueryKey } from '../types/MenuItemQueryKey';

const MENU_REFRESH_MS = 5000;

export function useOrderingCategories(enabled: boolean): UseQueryResult<MenuCategory[]> {
  const showApiError = useShowApiError('Unable to load menu categories.');
  const query = useQuery({
    queryKey: [MenuCategoryQueryKey.Categories, 'ordering'],
    queryFn: async ({ signal }): Promise<MenuCategory[]> => {
      const response = await api.get('/menu-categories', {
        params: { activeOnly: true },
        signal,
      });
      return menuCategoryListResponseSchema.parse(response.data);
    },
    enabled,
    staleTime: 0,
    refetchInterval: MENU_REFRESH_MS,
  });
  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, showApiError]);
  return query;
}

/** One existing list request supplies every category, avoiding a request per category. */
export function useOrderingItems(enabled: boolean): UseQueryResult<MenuItem[]> {
  const showApiError = useShowApiError('Unable to load the ordering menu.');
  const query = useQuery({
    queryKey: [MenuItemQueryKey.Items, 'ordering'],
    queryFn: async ({ signal }): Promise<MenuItem[]> => {
      const response = await api.get('/menu-items', { params: { activeOnly: true }, signal });
      return menuItemListResponseSchema.parse(response.data);
    },
    enabled,
    staleTime: 0,
    refetchInterval: MENU_REFRESH_MS,
  });
  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, showApiError]);
  return query;
}

export function useOrderingSearch(
  text: string,
  debouncedText: string,
  page: number,
  enabled: boolean,
): UseQueryResult<MenuItemSearchResponse> {
  const showApiError = useShowApiError('Unable to search the menu.');
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
      });
      return menuItemSearchResponseSchema.parse(response.data);
    },
    enabled: enabled && text.length > 0 && text === debouncedText,
    staleTime: 0,
    refetchInterval: MENU_REFRESH_MS,
  });
  useEffect(() => {
    if (query.error) showApiError(query.error);
  }, [query.error, showApiError]);
  return query;
}
