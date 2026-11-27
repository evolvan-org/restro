'use client';

import type { RestaurantTable } from '@rms/api-contract';
import type { ReactElement } from 'react';

import { CaptainAvatar, formatClockTime } from '@/components/FloorTile';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { shortNameOf } from '@/lib/qr';

import type { CaptainAssignment } from './useCaptainAssignment';

function tableNote(table: RestaurantTable): string {
  if (table.openOrderId) return 'Open order';
  if (table.activeReservation?.status === 'BOOKED') {
    return `Reserved ${formatClockTime(table.activeReservation.reservationAt)}`;
  }
  if (table.activeReservation) return 'Seated';
  return 'Free';
}

/** Confirms moving tables that another captain currently holds (REST-99, state 6). */
export default function TakeoverDialog({
  assignment,
}: {
  assignment: CaptainAssignment;
}): ReactElement | null {
  const pending = assignment.pendingTakeover;
  if (!pending) return null;

  const target = shortNameOf(pending.target.name);
  const count = pending.tables.length;
  const taken = pending.tables.filter((table) => table.captain !== null);
  const openOrders = pending.tables.filter((table) => table.openOrderId).length;
  const tablesLabel = `${count} ${count === 1 ? 'table' : 'tables'}`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) assignment.cancelTakeover();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Move {tablesLabel} to {target}?
          </DialogTitle>
          <DialogDescription>
            {taken.length === 1 ? 'This table is' : 'These tables are'} currently held by another
            captain. They stop seeing {taken.length === 1 ? 'it' : 'them'} once you move{' '}
            {taken.length === 1 ? 'it' : 'them'}.
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y rounded-lg border">
          {taken.map((table) => (
            <li key={table.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-12 shrink-0 font-semibold">{table.tableNumber}</span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {table.captain && <CaptainAvatar name={table.captain.name} />}
                <span className="truncate">{table.captain?.name}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{tableNote(table)}</span>
            </li>
          ))}
        </ul>

        {openOrders > 0 && (
          <p className="text-sm text-muted-foreground">
            {openOrders} open {openOrders === 1 ? 'order moves' : 'orders move'} with{' '}
            {count === 1 ? 'this table' : 'these tables'}.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={assignment.cancelTakeover}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={assignment.confirmTakeover}
            disabled={assignment.isPending}
          >
            Move {tablesLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
