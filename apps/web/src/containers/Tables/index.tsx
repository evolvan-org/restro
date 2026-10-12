'use client';

import { Permission } from '@rms/permissions';
import { DEFAULT_PAGE_SIZE } from '@rms/shared';
import { Pencil, Plus, Search } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
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
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { getApiErrorMessage } from '@/lib/api-error';
import { useTableList, useTableOptions } from '@/services/api/requests/tables';
import { useShowTableActiveModal } from '@/store/hooks/modal';
import { useShowTableFormSidePane } from '@/store/hooks/sidepane';

const SEARCH_DEBOUNCE_MS = 300;

export default function Tables(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.RESTAURANT_READ]);
  const { can } = usePermissions();
  const canRead = can(Permission.RESTAURANT_READ);
  const canWrite = can(Permission.RESTAURANT_WRITE);

  const [search, setSearch] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [isActive, setIsActive] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const options = useTableOptions(canRead);
  const tables = useTableList(
    {
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      search: debouncedSearch || undefined,
      sectionId: sectionId || undefined,
      statusId: statusId || undefined,
      isActive: isActive === '' ? undefined : isActive === 'true',
    },
    canRead,
  );

  const showTableForm = useShowTableFormSidePane();
  const showActiveModal = useShowTableActiveModal();

  if (!isAllowed) {
    return null;
  }

  const meta = tables.data?.meta;
  const rows = tables.data?.data ?? [];
  const hasFilters = Boolean(debouncedSearch || sectionId || statusId || isActive);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Restaurant setup</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Tables</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {canWrite
              ? 'Configure the physical tables used by reservations, ordering and billing.'
              : 'The configured tables for your restaurant.'}
          </p>
        </div>
        {canWrite ? (
          <Button type="button" onClick={() => showTableForm()}>
            <Plus aria-hidden />
            Add table
          </Button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            className="pl-8"
            placeholder="Search table number"
            aria-label="Search table number"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <NativeSelect
          aria-label="Filter by section"
          value={sectionId}
          disabled={options.isPending}
          onChange={(event) => {
            setSectionId(event.target.value);
            setPage(1);
          }}
        >
          <NativeSelectOption value="">All sections</NativeSelectOption>
          {(options.data?.sections ?? []).map((section) => (
            <NativeSelectOption key={section.id} value={section.id}>
              {section.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect
          aria-label="Filter by status"
          value={statusId}
          disabled={options.isPending}
          onChange={(event) => {
            setStatusId(event.target.value);
            setPage(1);
          }}
        >
          <NativeSelectOption value="">All statuses</NativeSelectOption>
          {(options.data?.statuses ?? []).map((status) => (
            <NativeSelectOption key={status.id} value={status.id}>
              {status.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <NativeSelect
          aria-label="Filter by active state"
          value={isActive}
          onChange={(event) => {
            setIsActive(event.target.value);
            setPage(1);
          }}
        >
          <NativeSelectOption value="">All states</NativeSelectOption>
          <NativeSelectOption value="true">Active</NativeSelectOption>
          <NativeSelectOption value="false">Inactive</NativeSelectOption>
        </NativeSelect>
      </div>

      {tables.isError ? (
        <div className="space-y-3 rounded-md border px-4 py-6 text-center">
          <p role="alert" className="text-sm text-destructive">
            {getApiErrorMessage(tables.error, 'Unable to load tables.')}
          </p>
          <Button type="button" variant="outline" onClick={() => tables.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>State</TableHead>
                {canWrite ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((table) => (
                <TableRow key={table.id}>
                  <TableCell className="font-medium">{table.tableNumber}</TableCell>
                  <TableCell>{table.section.name}</TableCell>
                  <TableCell>{table.capacity}</TableCell>
                  <TableCell>{table.currentStatus.name}</TableCell>
                  <TableCell>
                    <Badge variant={table.isActive ? 'default' : 'outline'}>
                      {table.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  {canWrite ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => showTableForm(table)}
                          aria-label={`Edit table ${table.tableNumber}`}
                        >
                          <Pencil aria-hidden />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => showActiveModal(table)}
                        >
                          {table.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
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
                    {tables.isPending
                      ? 'Loading tables...'
                      : hasFilters
                        ? 'No tables match your filters.'
                        : 'No tables yet.'}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}

      {meta && meta.total > 0 ? (
        <div className="mt-4 flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>
            {meta.total} {meta.total === 1 ? 'table' : 'tables'} · Page {meta.page} of{' '}
            {meta.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={meta.page <= 1 || tables.isFetching}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages || tables.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
