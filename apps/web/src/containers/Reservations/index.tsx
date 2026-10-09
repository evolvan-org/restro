'use client';

import type { ReservationStatus } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { DEFAULT_PAGE_SIZE } from '@rms/shared';
import { Plus } from 'lucide-react';
import type { ReactElement } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useReservations } from '@/services/api/requests/reservations';
import { useShowReservationFormSidePane, useShowWalkInFormSidePane } from '@/store/hooks/sidepane';

type ReservationFilters = { status: ReservationStatus | ''; page: number };

const STATUS_FILTERS: { value: ReservationStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'BOOKED', label: 'Booked' },
  { value: 'SEATED', label: 'Seated' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'NO_SHOW', label: 'No show' },
];

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function statusClassName(status: ReservationStatus): string {
  switch (status) {
    case 'SEATED':
      return 'bg-green-600 text-white hover:bg-green-600';
    case 'BOOKED':
      return 'bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-400/20 dark:text-blue-300 dark:hover:bg-blue-400/20';
    case 'COMPLETED':
      return 'bg-secondary text-secondary-foreground hover:bg-secondary';
    case 'CANCELLED':
    case 'NO_SHOW':
      return 'bg-destructive/10 text-destructive hover:bg-destructive/10';
  }
}

export default function Reservations(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.RESERVATION_READ]);
  const { can } = usePermissions();
  const canRead = can(Permission.RESERVATION_READ);
  const canWrite = can(Permission.RESERVATION_WRITE);
  const filters = useForm<ReservationFilters>({ defaultValues: { status: '', page: 1 } });
  const status = useWatch({ control: filters.control, name: 'status' });
  const page = useWatch({ control: filters.control, name: 'page' });
  const reservations = useReservations(
    { page, pageSize: DEFAULT_PAGE_SIZE, status: status || undefined },
    canRead,
  );
  const showWalkInForm = useShowWalkInFormSidePane();
  const showReservationForm = useShowReservationFormSidePane();

  if (!isAllowed) return null;

  const rows = reservations.data?.data ?? [];
  const meta = reservations.data?.meta;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">Service flow</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Reservations</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Track booked guests and walk-ins through service.
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => showWalkInForm()}>
              <Plus aria-hidden />
              Walk-in
            </Button>
            <Button type="button" onClick={() => showReservationForm()}>
              <Plus aria-hidden />
              Reservation
            </Button>
          </div>
        )}
      </div>

      <form
        aria-label="Reservation filters"
        onSubmit={(event) => event.preventDefault()}
        className="mb-4 flex flex-wrap items-center gap-3"
      >
        <NativeSelect
          aria-label="Filter by status"
          {...filters.register('status', {
            onChange: () => filters.setValue('page', 1),
          })}
        >
          {STATUS_FILTERS.map((filter) => (
            <NativeSelectOption key={filter.value} value={filter.value}>
              {filter.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </form>

      {reservations.isError ? (
        <div className="space-y-3 rounded-md border px-4 py-6 text-center">
          <p role="alert" className="text-sm text-destructive">
            Unable to load reservations.
          </p>
          <Button type="button" variant="outline" onClick={() => reservations.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reservation time</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((reservation) => (
                <TableRow key={reservation.id}>
                  <TableCell className="font-medium">{reservation.guest.guestName}</TableCell>
                  <TableCell>{reservation.guest.phoneNumber}</TableCell>
                  <TableCell>{reservation.partySize}</TableCell>
                  <TableCell>
                    <Badge className={statusClassName(reservation.status)}>
                      {reservation.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>{dateFormatter.format(new Date(reservation.reservationAt))}</TableCell>
                  <TableCell>{reservation.tableId ? reservation.tableId : 'Unassigned'}</TableCell>
                  <TableCell className="max-w-60 truncate">{reservation.notes ?? '-'}</TableCell>
                </TableRow>
              ))}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {reservations.isPending
                      ? 'Loading reservations...'
                      : status
                        ? 'No reservations match this status.'
                        : 'No reservations are in the flow yet.'}
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
            {meta.total} {meta.total === 1 ? 'reservation' : 'reservations'} · Page {meta.page} of{' '}
            {meta.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={meta.page <= 1 || reservations.isFetching}
              onClick={() => filters.setValue('page', page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages || reservations.isFetching}
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
