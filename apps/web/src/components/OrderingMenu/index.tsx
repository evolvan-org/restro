'use client';

import { Search } from 'lucide-react';
import type { ReactElement } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import OrderingMenuItem, { type OrderingItemAction } from '@/components/OrderingMenuItem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useOrderingCategories,
  useOrderingItems,
  useOrderingSearch,
} from '@/services/api/requests/ordering-menu';

import {
  getOrderingCategories,
  getOrderingMenuDefaults,
  groupOrderingItems,
  type OrderingMenuFilters,
} from './mappers';

type Props = { onAdd?: OrderingItemAction; isAdding?: boolean };

export default function OrderingMenu({ onAdd, isAdding }: Props): ReactElement {
  const { control, register, setValue } = useForm<OrderingMenuFilters>({
    defaultValues: getOrderingMenuDefaults(),
  });
  const search = useWatch({ control, name: 'search' }).trim();
  const categoryId = useWatch({ control, name: 'categoryId' });
  const page = useWatch({ control, name: 'page' });
  const debouncedSearch = useDebouncedValue(search, 300);
  const categories = useOrderingCategories(true);
  const items = useOrderingItems(search.length === 0);
  const results = useOrderingSearch(search, debouncedSearch, page, true);
  const activeCategories = getOrderingCategories(categories.data ?? []);
  const selectedCategoryId = activeCategories.some((category) => category.id === categoryId)
    ? categoryId
    : '';
  const groups = groupOrderingItems(activeCategories, items.data ?? [], selectedCategoryId);
  const isSearching = search.length > 0;
  const isWaitingForSearch = search !== debouncedSearch || results.isPending;
  const error = categories.error ?? (isSearching ? results.error : items.error);
  const meta = results.data?.meta;

  return (
    <section aria-label="Ordering menu" className="space-y-4">
      <h2 className="text-xl font-semibold">Menu</h2>
      <div className="flex flex-wrap items-start gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            className="pl-8"
            placeholder="Search item name or description"
            aria-label="Search ordering menu"
            maxLength={100}
            {...register('search', { onChange: () => setValue('page', 1) })}
          />
        </div>
        {!isSearching && (
          <NativeSelect aria-label="Browse menu category" {...register('categoryId')}>
            <NativeSelectOption value="">All categories</NativeSelectOption>
            {activeCategories.map((category) => (
              <NativeSelectOption key={category.id} value={category.id}>
                {category.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </div>

      {error && (
        <div role="alert" className="space-y-3 rounded-lg border p-4">
          <p className="text-sm text-destructive">
            {getApiErrorMessage(error, 'Unable to load the menu.')}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void categories.refetch();
              if (isSearching) void results.refetch();
              else void items.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      )}

      {!error && isSearching && (
        <div aria-live="polite" aria-busy={isWaitingForSearch} className="space-y-4">
          {isWaitingForSearch ? (
            <p className="text-sm text-muted-foreground">Searching menu...</p>
          ) : (
            <>
              <ul className="grid gap-3 sm:grid-cols-2">
                {(results.data?.data ?? []).map((item) => (
                  <OrderingMenuItem key={item.id} item={item} onAdd={onAdd} isAdding={isAdding} />
                ))}
              </ul>
              {results.data?.data.length === 0 && (
                <p className="text-sm text-muted-foreground">No menu items match your search.</p>
              )}
              {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <p>
                    Page {meta.page} of {meta.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || results.isFetching}
                      onClick={() => setValue('page', page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page >= meta.totalPages || results.isFetching}
                      onClick={() => setValue('page', page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!error && !isSearching && (
        <div className="space-y-6" aria-busy={categories.isPending || items.isPending}>
          {categories.isPending || items.isPending ? (
            <p className="text-sm text-muted-foreground">Loading menu...</p>
          ) : (
            <>
              {activeCategories.length === 0 && (
                <p className="text-sm text-muted-foreground">No menu categories are available.</p>
              )}
              {groups.map(({ category, items: categoryItems }) => (
                <section key={category.id} aria-label={category.name} className="space-y-3">
                  <h3 className="font-medium">{category.name}</h3>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {categoryItems.map((item) => (
                      <OrderingMenuItem
                        key={item.id}
                        item={item}
                        onAdd={onAdd}
                        isAdding={isAdding}
                      />
                    ))}
                  </ul>
                  {categoryItems.length === 0 && (
                    <p className="text-sm text-muted-foreground">No items in this category.</p>
                  )}
                </section>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
