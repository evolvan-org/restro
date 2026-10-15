'use client';

import { Permission } from '@rms/permissions';
import { Archive, ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { type ReactElement, useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { getServingTypeLabel } from '@/lib/serving-types';
import {
  useMenuCategories,
  useReorderMenuCategories,
} from '@/services/api/requests/menu-categories';
import { useShowMenuCategoryStatusModal } from '@/store/hooks/modal';
import { useShowMenuCategoryFormSidePane } from '@/store/hooks/sidepane';

export default function MenuCategories(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.MENU_READ]);
  const { can } = usePermissions();
  const canRead = can(Permission.MENU_READ);
  const canWrite = can(Permission.MENU_WRITE);
  const categories = useMenuCategories(canRead);
  const { mutateAsync: reorderCategories, isPending: isReordering } = useReorderMenuCategories();
  const showForm = useShowMenuCategoryFormSidePane();
  const showStatus = useShowMenuCategoryStatusModal();
  const showApiError = useShowApiError('Unable to load menu categories.');

  useEffect(() => {
    if (categories.error) showApiError(categories.error);
  }, [categories.error, categories.errorUpdatedAt, showApiError]);

  if (!isAllowed) return null;

  const rows = categories.data ?? [];

  const move = async (from: number, to: number): Promise<void> => {
    const reordered = [...rows];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);
    try {
      await reorderCategories({ orderedIds: reordered.map(({ id }) => id) });
    } catch {
      // The mutation hook reports the error through useShowApiError; preserve the current order.
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Menu</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Menu categories</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {canWrite
              ? 'Create and arrange the categories that group your menu items.'
              : 'The active and inactive menu categories configured for your restaurant.'}
          </p>
        </div>
        {canWrite && (
          <Button type="button" onClick={() => showForm()}>
            <Plus aria-hidden />
            Add category
          </Button>
        )}
      </div>

      {categories.isError ? (
        <div className="space-y-3 rounded-md border px-4 py-6 text-center">
          <p role="alert" className="text-sm text-destructive">
            Unable to load menu categories.
          </p>
          <Button type="button" variant="outline" onClick={() => categories.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((category, index) => (
                <TableRow key={category.id}>
                  <TableCell>
                    {canWrite ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === 0 || isReordering}
                          aria-label={`Move ${category.name} up`}
                          onClick={() => move(index, index - 1)}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === rows.length - 1 || isReordering}
                          aria-label={`Move ${category.name} down`}
                          onClick={() => move(index, index + 1)}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        <span className="ml-1 text-muted-foreground">{category.sortOrder}</span>
                      </div>
                    ) : (
                      category.sortOrder
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>{getServingTypeLabel(category.categoryType)}</TableCell>
                  <TableCell>
                    <Badge variant={category.isActive ? 'active' : 'inactive'}>
                      {category.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => showForm(category)}
                        >
                          <Pencil aria-hidden />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            showStatus(category, category.isActive ? 'deactivate' : 'activate')
                          }
                        >
                          {category.isActive && <Archive aria-hidden />}
                          {category.isActive ? 'Deactivate' : 'Activate'}
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
                    {categories.isPending ? 'Loading menu categories…' : 'No menu categories yet.'}
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
