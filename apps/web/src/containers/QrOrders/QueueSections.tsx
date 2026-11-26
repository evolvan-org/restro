'use client';

import type { QrQueueResponse } from '@rms/api-contract';
import { Bell, Check, Clock, Receipt, X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { BillRequestCard, QueueOrderCard } from './QueueCard';

function SectionTitle({
  icon,
  label,
  count,
}: {
  icon: ReactNode;
  label: string;
  count: number;
}): ReactElement {
  return (
    <h2 className="mt-[18px] mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
      {icon}
      {label}
      <span className="ml-0.5 inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-semibold tracking-normal normal-case">
        {count}
      </span>
    </h2>
  );
}

/**
 * The four queue sections. Phone: one list. Tablet: three columns (awaiting · sent to kitchen ·
 * bill & rejected), as in C2d.
 */
export function QueueSections({
  data,
  now,
  readOnly,
  selectedRoundId,
}: {
  data: QrQueueResponse;
  now: number;
  readOnly: boolean;
  selectedRoundId?: string;
}): ReactElement {
  const card = (item: QrQueueResponse['awaiting'][number]): ReactElement => (
    <QueueOrderCard
      key={item.roundId}
      card={item}
      now={now}
      escalationMinutes={data.escalationMinutes}
      readOnly={readOnly}
      selected={item.roundId === selectedRoundId}
    />
  );
  const awaiting = (
    <section aria-label="Awaiting approval">
      <SectionTitle
        icon={<Clock className="size-3.5" aria-hidden />}
        label="Awaiting approval"
        count={data.awaiting.length}
      />
      <div className="flex flex-col gap-2.5">{data.awaiting.map(card)}</div>
    </section>
  );
  const sent = (
    <section aria-label="Sent to kitchen">
      <SectionTitle
        icon={<Check className="size-3.5" aria-hidden />}
        label="Sent to kitchen"
        count={data.sentToKitchen.length}
      />
      <div className="flex flex-col gap-2.5">{data.sentToKitchen.map(card)}</div>
    </section>
  );
  const bills = data.billRequested.length > 0 && (
    <section aria-label="Bill requested">
      <SectionTitle
        icon={<Receipt className="size-3.5" aria-hidden />}
        label="Bill requested"
        count={data.billRequested.length}
      />
      <div className="flex flex-col gap-2.5">
        {data.billRequested.map((bill) => (
          <BillRequestCard key={bill.sessionId} card={bill} now={now} />
        ))}
      </div>
    </section>
  );
  const rejected = data.rejected.length > 0 && (
    <section aria-label="Rejected">
      <SectionTitle
        icon={<X className="size-3.5" aria-hidden />}
        label="Rejected"
        count={data.rejected.length}
      />
      <div className="flex flex-col gap-2.5">{data.rejected.map(card)}</div>
    </section>
  );

  return (
    <>
      <div className="md:hidden">
        {awaiting}
        {data.sentToKitchen.length > 0 && sent}
        {bills}
        {rejected}
      </div>
      <div className="hidden gap-3.5 md:grid md:grid-cols-3 md:items-start">
        <div className="min-w-0">{awaiting}</div>
        <div className="min-w-0">{sent}</div>
        <div className="min-w-0">
          <SectionTitle
            icon={<Bell className="size-3.5" aria-hidden />}
            label="Bill & rejected"
            count={data.billRequested.length + data.rejected.length}
          />
          <div className="flex flex-col gap-2.5">
            {data.billRequested.map((bill) => (
              <BillRequestCard key={bill.sessionId} card={bill} now={now} />
            ))}
            {data.rejected.map(card)}
          </div>
        </div>
      </div>
    </>
  );
}
