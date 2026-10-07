'use client';

import type { ReservationStatus } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { Plus } from 'lucide-react';
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
import { useReservations } from '@/services/api/requests/reservations';
import { useShowWalkInFormSidePane } from '@/store/hooks/sidepane';

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
  const reservations = useReservations(canRead);
  const showWalkInForm = useShowWalkInFormSidePane();

  if (!isAllowed) return null;

  const rows = reservations.data ?? [];

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
          <Button type="button" onClick={() => showWalkInForm()}>
            <Plus aria-hidden />
            Walk-in
          </Button>
        )}
      </div>

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
                      : 'No reservations are in the flow yet.'}
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
