'use client';

import { Permission } from '@rms/permissions';
import { Archive, Pencil, Plus } from 'lucide-react';
import type { ReactElement } from 'react';

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
import { useTableStatuses } from '@/services/api/requests/table-statuses';
import { useShowTableStatusActionModal } from '@/store/hooks/modal';
import { useShowTableStatusFormSidePane } from '@/store/hooks/sidepane';

export default function TableStatuses(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.RESTAURANT_READ]);
  const { can } = usePermissions();
  const canRead = can(Permission.RESTAURANT_READ);
  const canWrite = can(Permission.RESTAURANT_WRITE);
  const statuses = useTableStatuses(canRead);
  const showForm = useShowTableStatusFormSidePane();
  const showAction = useShowTableStatusActionModal();

  if (!isAllowed) return null;

  const rows = statuses.data ?? [];

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
        {canWrite && (
          <Button type="button" onClick={() => showForm()}>
            <Plus aria-hidden />
            Add status
          </Button>
        )}
      </div>

      {statuses.isError ? (
        <div className="space-y-3 rounded-md border px-4 py-6 text-center">
          <p role="alert" className="text-sm text-destructive">
            Unable to load table statuses.
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
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((status) => (
                <TableRow key={status.id}>
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
                  {canWrite && (
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
                          onClick={() =>
                            showAction(
                              status,
                              status.isActive && !status.isSystem ? 'archive' : 'status',
                            )
                          }
                        >
                          {status.isActive && !status.isSystem && <Archive aria-hidden />}
                          {status.isActive
                            ? status.isSystem
                              ? 'Deactivate'
                              : 'Archive'
                            : 'Activate'}
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
                    {statuses.isPending
                      ? 'Loading table statuses…'
                      : 'No table statuses are configured yet.'}
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
