'use client';

import { Permission } from '@rms/permissions';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useMenuCategories } from '@/services/api/requests/menu-categories';
import { useMenuItems } from '@/services/api/requests/menu-items';
import { useShowMenuItemDeleteModal } from '@/store/hooks/modal';
import { useShowMenuItemFormSidePane } from '@/store/hooks/sidepane';

export default function MenuItems(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.MENU_READ]);
  const { can } = usePermissions();
  const canRead = can(Permission.MENU_READ);
  const canWrite = can(Permission.MENU_WRITE);
  const [categoryId, setCategoryId] = useState('');
  const categories = useMenuCategories(canRead);
  const items = useMenuItems(categoryId || undefined, canRead);
  const showForm = useShowMenuItemFormSidePane();
  const showDelete = useShowMenuItemDeleteModal();
  const showApiError = useShowApiError('Unable to load menu items.');

  useEffect(() => {
    if (items.error) showApiError(items.error);
  }, [items.error, items.errorUpdatedAt, showApiError]);

  if (!isAllowed) return null;

  const rows = items.data ?? [];
  const categoryNames = new Map((categories.data ?? []).map((c) => [c.id, c.name]));

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

      <div className="mb-4 max-w-xs">
        <SearchableSelect
          aria-label="Filter by category"
          placeholder="All categories"
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: '', label: 'All categories' },
            ...(categories.data ?? []).map((category) => ({
              value: category.id,
              label: category.name,
            })),
          ]}
        />
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
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {item.itemType === 'FOOD' ? 'Food' : 'Bar'}
                    </span>
                  </TableCell>
                  <TableCell>{categoryNames.get(item.categoryId) ?? '—'}</TableCell>
                  <TableCell>{item.price}</TableCell>
                  <TableCell>
                    <Badge variant={item.isAvailable ? 'active' : 'inactive'}>
                      {item.isAvailable ? 'Available' : 'Unavailable'}
                    </Badge>
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
              ))}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canWrite ? 5 : 4}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {items.isPending ? 'Loading menu items…' : 'No menu items yet.'}
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
