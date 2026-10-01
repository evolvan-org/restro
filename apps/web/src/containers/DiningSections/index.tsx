'use client';

import { Permission } from '@rms/permissions';
import { Archive, ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
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

  if (!isAllowed) return null;

  const rows = sections.data ?? [];

  const move = (from: number, to: number): void => {
    const reordered = [...rows];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);
    reorder.mutate({ orderedIds: reordered.map(({ id }) => id) });
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
        {canWrite && (
          <Button type="button" onClick={() => showForm()}>
            <Plus aria-hidden />
            Add section
          </Button>
        )}
      </div>

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
                {canWrite && <TableHead className="text-right">Actions</TableHead>}
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
                  {canWrite && (
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
                          onClick={() =>
                            showAction(section, section.isActive ? 'archive' : 'activate')
                          }
                        >
                          {section.isActive && <Archive aria-hidden />}
                          {section.isActive ? 'Archive' : 'Activate'}
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
                    {sections.isPending ? 'Loading dining sections…' : 'No dining sections yet.'}
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
