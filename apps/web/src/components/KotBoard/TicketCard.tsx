'use client';

import type { KotDestination, KotQueueItem } from '@rms/api-contract';
import { useIsMutating } from '@tanstack/react-query';
import { ArrowRight, Check, Flame, LoaderCircle, Timer } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { useTransitionKot } from '@/services/api/requests/kots';
import { KotQueryKey } from '@/services/api/types/KotQueryKey';

import { elapsedLabel, KOT_LANES } from './mapper';

export default function TicketCard({
  ticket,
  destination,
  now,
  canAdvance,
}: {
  ticket: KotQueueItem;
  destination: KotDestination;
  now: number;
  canAdvance: boolean;
}): ReactElement {
  const { mutateAsync: advanceTicket } = useTransitionKot(destination, ticket.id);
  const isPending =
    useIsMutating({ mutationKey: [KotQueryKey.Transition, destination, ticket.id] }) > 0;
  const lane = KOT_LANES.find(({ status }) => status === ticket.status);

  async function advance(): Promise<void> {
    if (!lane) return;
    try {
      await advanceTicket({
        id: ticket.id,
        input: { expectedStatus: ticket.status, status: lane.next },
      });
    } catch {
      // The request hook restores the ticket and owns the shared error toast.
    }
  }

  return (
    <article
      aria-label={`${ticket.kotNumber}, table ${ticket.table.tableNumber}`}
      className="shrink-0 rounded-2xl border bg-card p-4 text-card-foreground shadow-xs"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold tracking-tight">{ticket.kotNumber}</h3>
          <p className="mt-1 text-sm text-muted-foreground">Table {ticket.table.tableNumber}</p>
        </div>
        <span
          title={new Date(ticket.createdAt).toLocaleString()}
          className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground"
        >
          <Timer className="size-3.5" aria-hidden />
          {elapsedLabel(ticket.createdAt, now)}
        </span>
      </div>
      <ul className="my-4 space-y-3 border-t pt-4">
        {ticket.items.map((item) => (
          <li key={item.id}>
            <p className="break-words text-base font-medium">
              <span className="mr-1.5 font-semibold">{item.quantity}×</span>
              {item.name}
            </p>
            {Boolean(item.specialInstructions) && (
              <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-sm font-medium text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                <Flame className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="break-words">
                  <span className="sr-only">Special instructions: </span>
                  {item.specialInstructions}
                </span>
              </p>
            )}
          </li>
        ))}
      </ul>
      {canAdvance && Boolean(lane) && (
        <Button
          type="button"
          className="min-h-12 w-full gap-2 rounded-xl bg-rose-700 px-4 text-base text-white hover:bg-rose-800 dark:bg-rose-500 dark:hover:bg-rose-600"
          disabled={isPending}
          onClick={advance}
          aria-label={`${lane?.action}: ${ticket.kotNumber}`}
        >
          {isPending ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : ticket.status === 'READY' ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <ArrowRight className="size-4" aria-hidden />
          )}
          {isPending ? 'Updating…' : lane?.action}
        </Button>
      )}
    </article>
  );
}
