'use client';

import type { QrBillRequestCard, QrQueueCard } from '@rms/api-contract';
import { Receipt } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { QrStatusPill, QrTimer } from '@/components/QrStatus';
import { buttonVariants } from '@/components/ui/button';
import {
  firstNameOf,
  formatRupees,
  formatWaiting,
  initialsOf,
  minutesAgo,
  timerTone,
} from '@/lib/qr';

const BAR_COLOR = { red: 'var(--qs-es)', amber: 'var(--qs-aw)', neutral: null } as const;

/** Order card (CP2): table, round, guests, items, total, live timer, status and one action. */
export function QueueOrderCard({
  card,
  now,
  escalationMinutes,
  readOnly,
  selected,
}: {
  card: QrQueueCard;
  now: number;
  escalationMinutes: number;
  readOnly: boolean;
  selected?: boolean;
}): ReactElement {
  const waiting = card.status === 'awaiting' || card.status === 'escalated';
  const tone = timerTone(card.submittedAt, escalationMinutes, card.escalatedAt !== null, now);
  const bar = waiting ? BAR_COLOR[tone] : null;
  const href = `/qr-orders/rounds/${card.roundId}`;
  return (
    <article
      className="rounded-[10px] border bg-card p-3.5 text-card-foreground"
      style={{
        boxShadow: bar ? `inset 3px 0 0 ${bar}` : undefined,
        outline: selected ? '2px solid var(--foreground)' : undefined,
        outlineOffset: selected ? 2 : undefined,
      }}
      aria-label={`Table ${card.table.number}, round ${card.roundNumber}`}
    >
      <div className="flex items-center gap-2">
        <b className="text-[22px] leading-none">Table {card.table.number}</b>
        <span className="inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-semibold">
          Round {card.roundNumber}
        </span>
        <span className="ml-auto">
          {waiting ? (
            <QrTimer tone={tone} text={formatWaiting(card.submittedAt, now)} />
          ) : card.status === 'rejected' && card.rejectedAt ? (
            <span className="text-[13px] text-muted-foreground">
              {minutesAgo(card.rejectedAt, now)}
            </span>
          ) : null}
        </span>
      </div>
      {card.status === 'rejected' ? (
        <p className="mt-2 text-[13px] text-muted-foreground">“{card.rejectReason}”</p>
      ) : (
        <>
          <div className="mt-2 text-muted-foreground">
            <b className="text-foreground">{formatRupees(card.total)}</b> · {card.guestCount}{' '}
            {card.guestCount === 1 ? 'guest' : 'guests'} · {card.itemCount}{' '}
            {card.itemCount === 1 ? 'item' : 'items'}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {card.itemsSummary}
          </div>
        </>
      )}
      {readOnly && card.captain && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="flex size-[26px] items-center justify-center rounded-full border bg-muted text-[11px] font-bold">
            {initialsOf(card.captain.name)}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {firstNameOf(card.captain.name)}’s table{card.escalatedAt ? ' · escalated' : ''}
          </span>
        </div>
      )}
      {!readOnly && card.escalatedAt && waiting && (
        <div className="mt-2 text-xs text-muted-foreground">Managers notified</div>
      )}
      {!readOnly && card.onMyWayAt && waiting && (
        <div className="mt-2 text-xs text-muted-foreground">On the way · timer paused</div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <QrStatusPill status={card.status} />
        <span className="ml-auto">
          {waiting && card.canAct ? (
            <Link href={href} className={buttonVariants({ className: 'min-h-10 px-3.5' })}>
              Review
            </Link>
          ) : card.status !== 'rejected' && !readOnly ? (
            <Link
              href={href}
              className={buttonVariants({ variant: 'outline', className: 'min-h-10 px-3.5' })}
            >
              View
            </Link>
          ) : null}
        </span>
      </div>
    </article>
  );
}

export function BillRequestCard({
  card,
  now,
}: {
  card: QrBillRequestCard;
  now: number;
}): ReactElement {
  return (
    <article className="rounded-[10px] border bg-card p-3.5 text-card-foreground">
      <div className="flex items-center gap-2.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Receipt className="size-5" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col">
          <b>Table {card.table.number} requested the bill</b>
          <span className="text-[13px] text-muted-foreground">
            {minutesAgo(card.requestedAt, now)} · {formatRupees(card.payable)}
            {card.sharesTotal > 0 && ` · ${card.sharesPaid} of ${card.sharesTotal} shares paid`}
            {card.paymentRequested && ' · wants to pay'}
          </span>
        </div>
      </div>
      <Link
        href={`/qr-orders/sessions/${card.sessionId}/bill`}
        className={buttonVariants({ className: 'mt-3 min-h-10 w-full' })}
      >
        Open bill
      </Link>
    </article>
  );
}
