'use client';

import type { KotQueueItem } from '@rms/api-contract';
import { useIsMutating } from '@tanstack/react-query';
import { ArrowRight, Check, CircleAlert, LoaderCircle, MapPin, Timer } from 'lucide-react';
import { memo, type ReactElement } from 'react';

import { useTransitionKot } from '@/services/api/requests/kots';
import { KotQueryKey } from '@/services/api/types/KotQueryKey';

import { type ActiveKotStatus, LANES, type StationConfig } from './config';
import { useNow } from './hooks';
import { formatClock, formatElapsed, type Urgency } from './mapper';

const TIMER_CLASS: Record<Urgency, string> = {
  ok: 'bg-[var(--surface2)] text-[var(--text)]',
  warn: 'bg-[var(--amber)] text-[var(--amber-fg)]',
  late: 'bg-[var(--red)] text-[var(--red-fg)]',
};

/** Owns the per-second tick so the card itself only re-renders when its urgency changes. */
function ElapsedTimer({
  createdAt,
  urgency,
}: {
  createdAt: string;
  urgency: Urgency;
}): ReactElement {
  const now = useNow();
  return (
    <span
      title={`Waiting since ${formatClock(createdAt)}`}
      className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[22px] leading-[26px] font-extrabold ${TIMER_CLASS[urgency]}`}
    >
      <Timer className="size-[18px]" strokeWidth={2.4} aria-hidden />
      {formatElapsed(createdAt, now)}
    </span>
  );
}

export type ActiveTicket = KotQueueItem & { status: ActiveKotStatus };

function TicketCard({
  ticket,
  station,
  urgency,
  canAdvance,
  disabled,
  animateIn,
}: {
  ticket: ActiveTicket;
  station: StationConfig;
  urgency: Urgency;
  canAdvance: boolean;
  disabled: boolean;
  animateIn: boolean;
}): ReactElement {
  const { destination } = station;
  const { mutateAsync: advanceTicket } = useTransitionKot(destination, ticket.id);
  const isPending =
    useIsMutating({ mutationKey: [KotQueryKey.Transition, destination, ticket.id] }) > 0;
  const lane = LANES[ticket.status];
  const { tableNumber, section } = ticket.table;
  const late = urgency === 'late';

  async function advance(): Promise<void> {
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
      aria-label={`Table ${tableNumber}, ${section.name}, ${ticket.kotNumber}, ${lane.label}`}
      className={`kds-s-${ticket.status} flex flex-col overflow-hidden rounded-2xl bg-[var(--surface)] ${late ? 'kds-late border-2 border-[var(--red)]' : 'border border-[var(--border)]'} ${animateIn ? 'kds-enter' : ''}`}
    >
      <div className="h-1.5 bg-[var(--s)]" aria-hidden />
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-bold tracking-[0.08em] text-[var(--muted)] uppercase">
            Table
          </span>
          <span className="text-[44px] leading-[44px] font-extrabold tracking-[-0.03em]">
            {tableNumber}
          </span>
          <span
            title={section.name}
            className="mt-1.5 flex max-w-full items-center gap-1.5 self-start rounded-lg bg-[var(--surface2)] py-[5px] pr-2.5 pl-2 text-[15px] leading-5 font-bold"
          >
            <MapPin className="size-[15px] shrink-0" strokeWidth={2.4} aria-hidden />
            <span className="truncate">{section.name}</span>
          </span>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ElapsedTimer createdAt={ticket.createdAt} urgency={urgency} />
          <span className="rounded-full bg-[var(--s)] px-2.5 py-[3px] text-xs font-extrabold tracking-[0.08em] text-[var(--s-fg)] uppercase">
            {lane.label}
          </span>
        </div>
      </div>
      <div className="flex justify-between gap-2 border-b border-[var(--border)] px-4 pb-3 text-[13px] text-[var(--muted)]">
        <b className="font-semibold">{ticket.kotNumber}</b>
        <span>Sent {formatClock(ticket.createdAt)}</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 px-4 pt-3 pb-3.5">
        {ticket.items.map((item) => (
          <li key={item.id}>
            <div className="flex items-start gap-3">
              <span className="grid h-[30px] min-w-[34px] shrink-0 place-items-center rounded-lg bg-[var(--surface2)] px-1.5 text-[17px] font-extrabold">
                {item.quantity}×
              </span>
              <span className="text-[19px] leading-[30px] font-semibold text-pretty">
                {item.name}
              </span>
            </div>
            {Boolean(item.specialInstructions) && (
              <p className="mt-1.5 ml-[46px] flex items-start gap-2 rounded-lg bg-[var(--note-bg)] px-2.5 py-[7px] text-[15px] leading-5 font-semibold text-[var(--note-fg)]">
                <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} aria-hidden />
                <span>
                  <span className="sr-only">Special instructions: </span>
                  {item.specialInstructions}
                </span>
              </p>
            )}
          </li>
        ))}
      </ul>
      {canAdvance && (
        <div className="mt-auto px-3 pb-3">
          <button
            type="button"
            disabled={disabled || isPending}
            onClick={advance}
            aria-label={`${lane.action}, table ${tableNumber}, ${ticket.kotNumber}`}
            className={`flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl text-lg font-bold ${ticket.status === 'PENDING' ? 'bg-[var(--primary)] text-[var(--primary-fg)]' : 'bg-[var(--s)] text-[var(--s-fg)]'}`}
          >
            {isPending ? (
              <LoaderCircle className="size-5 animate-spin" strokeWidth={2.6} aria-hidden />
            ) : ticket.status === 'READY' ? (
              <Check className="size-5" strokeWidth={2.6} aria-hidden />
            ) : (
              <ArrowRight className="size-5" strokeWidth={2.6} aria-hidden />
            )}
            {isPending ? 'Updating…' : lane.action}
          </button>
        </div>
      )}
    </article>
  );
}

export default memo(TicketCard);
