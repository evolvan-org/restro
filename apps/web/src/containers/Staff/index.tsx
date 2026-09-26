'use client';

import type { StaffStatus, UserStatus } from '@rms/api-contract';
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
import usePermissions from '@/hooks/auth/usePermissions';
import useDebouncedValue from '@/hooks/useDebouncedValue';
import { getApiErrorMessage } from '@/lib/api-error';
import { useProfile } from '@/services/api/requests/profile';
import { useStaffList, useStaffRoles } from '@/services/api/requests/staff';
import { useShowStaffStatusModal } from '@/store/hooks/modal';
import { useShowStaffFormSidePane } from '@/store/hooks/sidepane';

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_FILTERS: { value: StaffStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const STATUS_BADGES: Record<
  UserStatus,
  { label: string; variant: 'default' | 'outline' | 'destructive' }
> = {
  ACTIVE: { label: 'Active', variant: 'default' },
  INACTIVE: { label: 'Inactive', variant: 'outline' },
  SUSPENDED: { label: 'Suspended', variant: 'destructive' },
};

function PageMessage({ children, alert }: { children: string; alert?: boolean }): ReactElement {
  return (
    <main className="mx-auto flex max-w-6xl items-center justify-center px-6 py-24">
      <p role={alert ? 'alert' : undefined} className="text-sm text-muted-foreground">
        {children}
      </p>
    </main>
  );
}

export default function Staff(): ReactElement {
  const { data: profile } = useProfile();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const canRead = can(Permission.USER_READ);
  const canWrite = can(Permission.USER_WRITE);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StaffStatus | ''>('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const staff = useStaffList(
    {
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      search: debouncedSearch || undefined,
      status: status || undefined,
    },
    canRead,
  );
  // The API only lets you manage accounts whose role you could assign yourself (e.g. a manager
  // can't edit an admin), so row actions follow the same list of assignable roles.
  const assignableRoles = useStaffRoles(canWrite);
  const manageableRoleIds = new Set((assignableRoles.data ?? []).map((role) => role.id));
  const showStaffForm = useShowStaffFormSidePane();
  const showStatusModal = useShowStaffStatusModal();

  if (permissionsLoading) {
    return <PageMessage>Loading…</PageMessage>;
  }

  if (!canRead) {
    return <PageMessage alert>You don&apos;t have permission to view staff accounts.</PageMessage>;
  }

  const meta = staff.data?.meta;
  const rows = staff.data?.data ?? [];
  const hasFilters = Boolean(debouncedSearch || status);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Administration</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Staff accounts</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {canWrite
              ? 'Create accounts for your team, assign roles, and control who can log in.'
              : 'Everyone with an account in your restaurant.'}
          </p>
        </div>
        {canWrite ? (
          <Button type="button" onClick={() => showStaffForm()}>
            <Plus aria-hidden />
            Add staff
          </Button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            className="pl-8"
            placeholder="Search by name or email"
            aria-label="Search staff by name or email"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <NativeSelect
          aria-label="Filter by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as StaffStatus | '');
            setPage(1);
          }}
        >
          {STATUS_FILTERS.map((filter) => (
            <NativeSelectOption key={filter.value} value={filter.value}>
              {filter.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {staff.isError ? (
        <div className="space-y-3 rounded-md border px-4 py-6 text-center">
          <p role="alert" className="text-sm text-destructive">
            {getApiErrorMessage(staff.error, 'Unable to load staff accounts.')}
          </p>
          <Button type="button" variant="outline" onClick={() => staff.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {canWrite ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((account) => {
                const badge = STATUS_BADGES[account.status];
                const isSelf = account.email === profile?.email;
                const canManage = canWrite && manageableRoleIds.has(account.role.id);

                return (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">
                      {account.name}
                      {isSelf ? <span className="ml-2 text-muted-foreground">(you)</span> : null}
                    </TableCell>
                    <TableCell>{account.email}</TableCell>
                    <TableCell>{account.phone ?? '—'}</TableCell>
                    <TableCell>{account.role.name}</TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    {canWrite ? (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canManage ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => showStaffForm(account)}
                              aria-label={`Edit ${account.name}`}
                            >
                              <Pencil aria-hidden />
                              Edit
                            </Button>
                          ) : null}
                          {!canManage || isSelf ? null : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => showStatusModal(account)}
                            >
                              {account.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}

              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canWrite ? 6 : 5}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {staff.isPending
                      ? 'Loading staff accounts…'
                      : hasFilters
                        ? 'No staff accounts match your search.'
                        : 'No staff accounts yet.'}
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
            {meta.total} {meta.total === 1 ? 'account' : 'accounts'} · Page {meta.page} of{' '}
            {meta.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={meta.page <= 1 || staff.isFetching}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages || staff.isFetching}
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
