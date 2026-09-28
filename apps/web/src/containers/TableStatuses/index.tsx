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
import { useReorderTableStatuses, useTableStatuses } from '@/services/api/requests/table-statuses';
import { useShowTableStatusActionModal } from '@/store/hooks/modal';
import { useShowTableStatusFormSidePane } from '@/store/hooks/sidepane';

export default function TableStatuses(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.RESTAURANT_READ]);
  const { can } = usePermissions();
  const canRead = can(Permission.RESTAURANT_READ);
  const canWrite = can(Permission.RESTAURANT_WRITE);
  const statuses = useTableStatuses(canRead);
  const reorder = useReorderTableStatuses();
  const showForm = useShowTableStatusFormSidePane();
  const showAction = useShowTableStatusActionModal();
  const [reorderError, setReorderError] = useState<string | null>(null);

  if (!isAllowed) return null;

  const rows = statuses.data ?? [];

  const move = async (index: number, direction: -1 | 1): Promise<void> => {
    const destination = index + direction;
    if (destination < 0 || destination >= rows.length) return;

    const reordered = [...rows];
    const current = reordered[index];
    const adjacent = reordered[destination];
    if (!current || !adjacent) return;
    reordered[index] = adjacent;
    reordered[destination] = current;

    setReorderError(null);
    try {
      await reorder.mutateAsync({ orderedIds: reordered.map(({ id }) => id) });
    } catch (error) {
      setReorderError(getApiErrorMessage(error, 'Unable to reorder table statuses.'));
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Restaurant settings</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Table statuses</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {canWrite
              ? 'Configure the statuses your team uses to track table availability.'
              : 'Statuses available for tables in your restaurant.'}
          </p>
        </div>
        {canWrite ? (
          <Button type="button" onClick={() => showForm()}>
            <Plus aria-hidden />
            Add status
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

      {statuses.isError ? (
        <div className="space-y-3 rounded-md border px-4 py-6 text-center">
          <p role="alert" className="text-sm text-destructive">
            {getApiErrorMessage(statuses.error, 'Unable to load table statuses.')}
          </p>
          <Button type="button" variant="outline" onClick={() => statuses.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Display order</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                {canWrite ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((status, index) => (
                <TableRow key={status.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="min-w-6 text-center tabular-nums">{status.sortOrder}</span>
                      {canWrite ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={index === 0 || reorder.isPending}
                            onClick={() => void move(index, -1)}
                            aria-label={`Move ${status.name} up`}
                          >
                            <ArrowUp aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={index === rows.length - 1 || reorder.isPending}
                            onClick={() => void move(index, 1)}
                            aria-label={`Move ${status.name} down`}
                          >
                            <ArrowDown aria-hidden />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs font-medium">{status.code}</code>
                  </TableCell>
                  <TableCell className="font-medium">{status.name}</TableCell>
                  <TableCell>
                    <Badge variant={status.isSystem ? 'secondary' : 'outline'}>
                      {status.isSystem ? 'System' : 'Custom'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        status.isActive
                          ? 'bg-green-600 text-white hover:bg-green-600'
                          : 'bg-yellow-400 text-yellow-950 hover:bg-yellow-400'
                      }
                    >
                      {status.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  {canWrite ? (
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => showForm(status)}
                        >
                          <Pencil aria-hidden />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => showAction(status, 'status')}
                        >
                          {status.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        {!status.isSystem ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => showAction(status, 'delete')}
                          >
                            <Trash2 aria-hidden />
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}

              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canWrite ? 6 : 5}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {statuses.isPending
                      ? 'Loading table statuses…'
                      : 'No table statuses are configured yet.'}
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
