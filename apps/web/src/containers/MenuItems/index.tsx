'use client';

import type { MenuItem, ServingType } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { Loader2, Pencil, Plus, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { type ReactElement, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import MenuItemClassificationEditor from '@/components/MenuItemClassificationEditor';
import MenuItemPriceEditor from '@/components/MenuItemPriceEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
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
import { getServingTypeLabel, getServingTypeOptions } from '@/lib/serving-types';
import { useMenuCategories } from '@/services/api/requests/menu-categories';
import { useMenuItems, useUpdateMenuItemAvailability } from '@/services/api/requests/menu-items';
import { useShowMenuItemDeleteModal } from '@/store/hooks/modal';
import { useShowMenuItemFormSidePane } from '@/store/hooks/sidepane';

export default function MenuItems(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.MENU_READ]);
  const { can } = usePermissions();
  const canRead = can(Permission.MENU_READ);
  const canWrite = can(Permission.MENU_WRITE);
  const filters = useForm<{ categoryId: string; itemType: ServingType | '' }>({
    defaultValues: { categoryId: '', itemType: '' },
  });
  const categoryId = useWatch({ control: filters.control, name: 'categoryId' });
  const itemType = useWatch({ control: filters.control, name: 'itemType' });
  const categories = useMenuCategories(canRead);
  const items = useMenuItems(
    { categoryId: categoryId || undefined, itemType: itemType || undefined },
    canRead,
  );
  const {
    mutateAsync: updateAvailability,
    isPending: isUpdatingAvailability,
    variables: availabilityVariables,
  } = useUpdateMenuItemAvailability();
  const showForm = useShowMenuItemFormSidePane();
  const showDelete = useShowMenuItemDeleteModal();
  const showApiError = useShowApiError('Unable to load menu items.');

  useEffect(() => {
    if (items.error) showApiError(items.error);
  }, [items.error, items.errorUpdatedAt, showApiError]);

  useEffect(() => {
    if (categories.error) showApiError(categories.error);
  }, [categories.error, categories.errorUpdatedAt, showApiError]);

  if (!isAllowed) return null;

  const rows = items.data ?? [];
  const categoriesById = new Map(
    (categories.data ?? []).map((category) => [category.id, category]),
  );

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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <SearchableSelect
            aria-label="Filter by category"
            placeholder="All categories"
            value={categoryId}
            onChange={(value) => filters.setValue('categoryId', value)}
            options={[
              { value: '', label: 'All categories' },
              ...(categories.data ?? []).map((category) => ({
                value: category.id,
                label: `${category.name} (${getServingTypeLabel(category.categoryType)})`,
              })),
            ]}
          />
        </div>
        <NativeSelect aria-label="Filter by classification" {...filters.register('itemType')}>
          <option value="">All types</option>
          {getServingTypeOptions().map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>

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
                      {canWrite ? (
                        <MenuItemClassificationEditor
                          item={item}
                          categoryType={category?.categoryType}
                        />
                      ) : (
                        <Badge variant="outline">{getServingTypeLabel(item.itemType)}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canWrite ? <MenuItemPriceEditor item={item} /> : item.price}
                    </TableCell>
                    <TableCell>
                      {canWrite ? (
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
                            onClick={() => showDelete(item)}
                          >
                            <Trash2 aria-hidden />
                            Delete
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
                      : categoryId || itemType
                        ? 'No menu items match these filters.'
                        : 'No menu items yet.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
