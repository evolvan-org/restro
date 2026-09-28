'use client';

import { Permission } from '@rms/permissions';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { type ReactElement, useState } from 'react';

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
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  useDiningSections,
  useReorderDiningSections,
} from '@/services/api/requests/dining-sections';
import { useShowDiningSectionActionModal } from '@/store/hooks/modal';
import { useShowDiningSectionFormSidePane } from '@/store/hooks/sidepane';

export default function DiningSections(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.RESTAURANT_READ]);
  const { can } = usePermissions();
  const canRead = can(Permission.RESTAURANT_READ);
  const canWrite = can(Permission.RESTAURANT_WRITE);
  const sections = useDiningSections(canRead);
  const reorder = useReorderDiningSections();
  const showForm = useShowDiningSectionFormSidePane();
  const showAction = useShowDiningSectionActionModal();
  const [reorderError, setReorderError] = useState<string | null>(null);

  if (!isAllowed) return null;

  const rows = sections.data ?? [];

  const move = async (from: number, to: number): Promise<void> => {
    const reordered = [...rows];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);
    setReorderError(null);
    try {
      await reorder.mutateAsync({ orderedIds: reordered.map(({ id }) => id) });
    } catch (error) {
      setReorderError(getApiErrorMessage(error, 'Unable to save the new section order.'));
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Restaurant configuration</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dining sections</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {canWrite
              ? 'Create and arrange the areas used to organize your restaurant tables.'
              : 'The active and inactive areas configured for your restaurant.'}
          </p>
        </div>
        {canWrite ? (
          <Button type="button" onClick={() => showForm()}>
            <Plus aria-hidden />
            Add section
          </Button>
        ) : null}
      </div>

      {reorderError ? (
        <p
          role="alert"
          className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {reorderError}
        </p>
      ) : null}

      {sections.isError ? (
        <div className="space-y-3 rounded-md border px-4 py-6 text-center">
          <p role="alert" className="text-sm text-destructive">
            {getApiErrorMessage(sections.error, 'Unable to load dining sections.')}
          </p>
          <Button type="button" variant="outline" onClick={() => sections.refetch()}>
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
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                {canWrite ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((section, index) => (
                <TableRow key={section.id}>
                  <TableCell>
                    {canWrite ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === 0 || reorder.isPending}
                          aria-label={`Move ${section.name} up`}
                          onClick={() => move(index, index - 1)}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === rows.length - 1 || reorder.isPending}
                          aria-label={`Move ${section.name} down`}
                          onClick={() => move(index, index + 1)}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        <span className="ml-1 text-muted-foreground">{section.sortOrder}</span>
                      </div>
                    ) : (
                      section.sortOrder
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{section.name}</TableCell>
                  <TableCell className="max-w-sm whitespace-normal">
                    {section.description ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={section.isActive ? 'active' : 'inactive'}>
                      {section.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  {canWrite ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => showForm(section)}
                        >
                          <Pencil aria-hidden />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => showAction(section, 'status')}
                        >
                          {section.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${section.name}`}
                          onClick={() => showAction(section, 'delete')}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}

              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canWrite ? 5 : 4}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {sections.isPending ? 'Loading dining sections…' : 'No dining sections yet.'}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
