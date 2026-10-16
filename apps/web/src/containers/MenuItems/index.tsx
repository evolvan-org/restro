'use client';

import type { MenuItem, ServingType } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { DEFAULT_PAGE_SIZE } from '@rms/shared';
import { Archive, Loader2, Pencil, Plus, Search, ToggleLeft, ToggleRight } from 'lucide-react';
import { type ReactElement, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import MenuItemClassificationEditor from '@/components/MenuItemClassificationEditor';
import MenuItemPriceEditor from '@/components/MenuItemPriceEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import useShowApiError from '@/hooks/api/useShowApiError';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { getServingTypeLabel, getServingTypeOptions } from '@/lib/serving-types';
import { useMenuCategories } from '@/services/api/requests/menu-categories';
import {
  useMenuItemSearch,
  useUpdateMenuItemAvailability,
} from '@/services/api/requests/menu-items';
import { useShowMenuItemStatusModal } from '@/store/hooks/modal';
import { useShowMenuItemFormSidePane } from '@/store/hooks/sidepane';

const SEARCH_DEBOUNCE_MS = 300;

type MenuItemFilters = {
  q: string;
  categoryId: string;
  itemType: ServingType | '';
  isAvailable: '' | 'true' | 'false';
  page: number;
};

const AVAILABILITY_FILTERS: { value: '' | 'true' | 'false'; label: string }[] = [
  { value: '', label: 'All availability' },
  { value: 'true', label: 'Available' },
  { value: 'false', label: 'Unavailable' },
];

export default function MenuItems(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.MENU_READ]);
  const { can } = usePermissions();
  const canRead = can(Permission.MENU_READ);
  const canWrite = can(Permission.MENU_WRITE);

  const filters = useForm<MenuItemFilters>({
    defaultValues: { q: '', categoryId: '', itemType: '', isAvailable: '', page: 1 },
  });
  const q = useWatch({ control: filters.control, name: 'q' });
  const categoryId = useWatch({ control: filters.control, name: 'categoryId' });
  const itemType = useWatch({ control: filters.control, name: 'itemType' });
  const isAvailable = useWatch({ control: filters.control, name: 'isAvailable' });
  const page = useWatch({ control: filters.control, name: 'page' });
  const debouncedQ = useDebouncedValue(q.trim(), SEARCH_DEBOUNCE_MS);
  const resetPage = (): void => filters.setValue('page', 1);

  const categories = useMenuCategories(canRead);
  const items = useMenuItemSearch(
    {
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      q: debouncedQ || undefined,
      categoryId: categoryId || undefined,
      itemType: itemType || undefined,
      isAvailable: isAvailable === '' ? undefined : isAvailable === 'true',
      activeOnly: false,
    },
    canRead,
  );
  const {
    mutateAsync: updateAvailability,
    isPending: isUpdatingAvailability,
    variables: availabilityVariables,
  } = useUpdateMenuItemAvailability();
  const showForm = useShowMenuItemFormSidePane();
  const showStatus = useShowMenuItemStatusModal();
  const showApiError = useShowApiError('Unable to load menu items.');

  useEffect(() => {
    if (items.error) showApiError(items.error);
  }, [items.error, items.errorUpdatedAt, showApiError]);

  useEffect(() => {
    if (categories.error) showApiError(categories.error);
  }, [categories.error, categories.errorUpdatedAt, showApiError]);

  if (!isAllowed) return null;

  const meta = items.data?.meta;
  const rows = items.data?.data ?? [];
  const categoriesById = new Map(
    (categories.data ?? []).map((category) => [category.id, category]),
  );
  const hasFilters = Boolean(debouncedQ || categoryId || itemType || isAvailable);

  const toggleAvailability = async (item: MenuItem): Promise<void> => {
    try {
      await updateAvailability({ id: item.id, input: { isAvailable: !item.isAvailable } });
    } catch {
      // The mutation hook reports the error; keep the last confirmed availability visible.
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Menu</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Menu items</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {canWrite
              ? 'Create the dishes and drinks you sell, each with its recipe.'
              : 'The dishes and drinks your restaurant sells, with their recipes.'}
          </p>
        </div>
        {canWrite && (
          <Button type="button" onClick={() => showForm()}>
            <Plus aria-hidden />
            Add item
          </Button>
        )}
      </div>

      <form
        aria-label="Menu item filters"
        onSubmit={(event) => event.preventDefault()}
        className="mb-4 flex flex-wrap items-center gap-3"
      >
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            className="pl-8"
            placeholder="Search by name or description"
            aria-label="Search menu items by name or description"
            {...filters.register('q', { onChange: resetPage })}
          />
        </div>
        <div className="w-full sm:w-56">
          <SearchableSelect
            aria-label="Filter by category"
            placeholder="All categories"
            value={categoryId}
            onChange={(value) => {
              filters.setValue('categoryId', value);
              resetPage();
            }}
            options={[
              { value: '', label: 'All categories' },
              ...(categories.data ?? []).map((category) => ({
                value: category.id,
                label: `${category.name} (${getServingTypeLabel(category.categoryType)})`,
              })),
            ]}
          />
        </div>
        <NativeSelect
          aria-label="Filter by classification"
          {...filters.register('itemType', { onChange: resetPage })}
        >
          <option value="">All types</option>
          {getServingTypeOptions().map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by availability"
          {...filters.register('isAvailable', { onChange: resetPage })}
        >
          {AVAILABILITY_FILTERS.map((filter) => (
            <NativeSelectOption key={filter.value} value={filter.value}>
              {filter.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </form>

      {items.isError ? (
        <div className="space-y-3 rounded-md border px-4 py-6 text-center">
          <p role="alert" className="text-sm text-destructive">
            Unable to load menu items.
          </p>
          <Button type="button" variant="outline" onClick={() => items.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => {
                const category = categoriesById.get(item.categoryId);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      {category?.name ?? '—'}
                      {category && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {getServingTypeLabel(category.categoryType)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canWrite && item.isActive ? (
                        <MenuItemClassificationEditor
                          item={item}
                          categoryType={category?.categoryType}
                        />
                      ) : (
                        <Badge variant="outline">{getServingTypeLabel(item.itemType)}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canWrite && item.isActive ? <MenuItemPriceEditor item={item} /> : item.price}
                    </TableCell>
                    <TableCell>
                      {!item.isActive ? (
                        <Badge variant="inactive">Inactive</Badge>
                      ) : canWrite ? (
                        <Button
                          type="button"
                          role="switch"
                          aria-checked={item.isAvailable}
                          aria-label={`Availability of ${item.name}`}
                          title={`Mark ${item.name} ${item.isAvailable ? 'unavailable' : 'available'}`}
                          variant={item.isAvailable ? 'success' : 'outline'}
                          size="sm"
                          disabled={isUpdatingAvailability}
                          onClick={() => toggleAvailability(item)}
                        >
                          {isUpdatingAvailability && availabilityVariables?.id === item.id ? (
                            <Loader2 aria-hidden className="animate-spin" />
                          ) : item.isAvailable ? (
                            <ToggleRight aria-hidden />
                          ) : (
                            <ToggleLeft aria-hidden />
                          )}
                          {item.isAvailable ? 'Available' : 'Unavailable'}
                        </Button>
                      ) : (
                        <Badge variant={item.isAvailable ? 'active' : 'inactive'}>
                          {item.isAvailable ? 'Available' : 'Unavailable'}
                        </Badge>
                      )}
                    </TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => showForm(item)}
                          >
                            <Pencil aria-hidden />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              showStatus(item, item.isActive ? 'deactivate' : 'activate')
                            }
                          >
                            {item.isActive && <Archive aria-hidden />}
                            {item.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canWrite ? 6 : 5}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {items.isPending
                      ? 'Loading menu items…'
                      : hasFilters
                        ? 'No menu items match your search.'
                        : 'No menu items yet.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {meta && meta.total > 0 && (
        <div className="mt-4 flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>
            {meta.total} {meta.total === 1 ? 'item' : 'items'} · Page {meta.page} of{' '}
            {meta.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={meta.page <= 1 || items.isFetching}
              onClick={() => filters.setValue('page', page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages || items.isFetching}
              onClick={() => filters.setValue('page', page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
