'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import type { ReactElement } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import OrderingMenuItem, { type OrderingItemAction } from '@/components/OrderingMenuItem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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
import styles from './menu.module.css';

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
  const results = useOrderingSearch(search, debouncedSearch, page, true);
  const activeCategories = getOrderingCategories(categories.data ?? []);
  const selectedCategoryId = activeCategories.some((category) => category.id === categoryId)
    ? categoryId
    : '';
  const items = useOrderingItems(selectedCategoryId, page, search.length === 0);
  const groups = groupOrderingItems(
    activeCategories,
    items.data?.data ?? [],
    selectedCategoryId,
  ).filter((group) => group.items.length > 0);
  const isSearching = search.length > 0;
  const isWaitingForSearch = search !== debouncedSearch || results.isPending;
  const error = categories.error ?? (isSearching ? results.error : items.error);
  const meta = isSearching ? results.data?.meta : items.data?.meta;
  const isLoading = isSearching ? isWaitingForSearch : categories.isPending || items.isPending;
  const visibleItems = isSearching
    ? (results.data?.data ?? [])
    : groups.flatMap((group) => group.items);

  function selectCategory(id: string): void {
    setValue('categoryId', id);
    setValue('page', 1);
  }

  return (
    <section aria-label="Ordering menu" className={styles.menu}>
      <h2 className="sr-only">Menu</h2>
      <div className="relative shrink-0">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          className="h-11 rounded-2xl bg-muted/40 pl-10 shadow-none"
          placeholder="Search menu..."
          aria-label="Search ordering menu"
          maxLength={100}
          {...register('search', { onChange: () => setValue('page', 1) })}
        />
      </div>

      {!isSearching && (
        <div className={styles.mobileCategory}>
          <Sheet>
            <SheetTrigger className="flex min-h-12 w-full items-center gap-3 rounded-xl border bg-card px-4 text-left shadow-sm">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Category
                </span>
                <span className="truncate text-sm font-semibold">
                  {activeCategories.find((category) => category.id === selectedCategoryId)?.name ??
                    'All'}
                </span>
              </span>
              <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80dvh] rounded-t-2xl p-0 lg:hidden">
              <SheetHeader>
                <SheetTitle>Category</SheetTitle>
              </SheetHeader>
              <nav
                aria-label="Choose menu category"
                className="flex min-h-0 flex-col gap-1 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
              >
                {[{ id: '', name: 'All' }, ...activeCategories].map((category) => (
                  <SheetClose
                    key={category.id}
                    className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium aria-pressed:bg-accent aria-pressed:font-semibold"
                    aria-pressed={selectedCategoryId === category.id}
                    onClick={() => selectCategory(category.id)}
                  >
                    <span className="min-w-0 flex-1 break-words">{category.name}</span>
                    {selectedCategoryId === category.id && (
                      <Check className="size-4 shrink-0" aria-hidden />
                    )}
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      )}

      <div className={styles.browser}>
        {!isSearching && (
          <nav aria-label="Menu categories" className={styles.categories}>
            <button
              type="button"
              className={styles.category}
              aria-pressed={selectedCategoryId === ''}
              onClick={() => selectCategory('')}
            >
              All
            </button>
            {activeCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={styles.category}
                aria-pressed={selectedCategoryId === category.id}
                onClick={() => selectCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </nav>
        )}

        <div className={styles.results} aria-live="polite" aria-busy={isLoading}>
          {error && (
            <div role="alert" className="space-y-3 rounded-xl border p-4">
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
          {!error && isLoading && (
            <p className="p-4 text-sm text-muted-foreground">
              {isSearching ? 'Searching menu...' : 'Loading menu...'}
            </p>
          )}
          {!error && !isLoading && (
            <>
              <ul className={styles.items}>
                {visibleItems.map((item) => (
                  <OrderingMenuItem key={item.id} item={item} onAdd={onAdd} isAdding={isAdding} />
                ))}
              </ul>
              {visibleItems.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">
                  {isSearching
                    ? 'No menu items match your search.'
                    : 'No menu items are available.'}
                </p>
              )}
            </>
          )}
        </div>
      </div>
      {!error && meta && meta.totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
          <p>
            Page {meta.page} of {meta.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || (isSearching ? results.isFetching : items.isFetching)}
              onClick={() => setValue('page', page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                page >= meta.totalPages || (isSearching ? results.isFetching : items.isFetching)
              }
              onClick={() => setValue('page', page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
