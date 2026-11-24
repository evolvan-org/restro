'use client';

import { QR_REJECT_REASONS, type QrRoundDetail } from '@rms/api-contract';
import { cn } from 'cn';
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Footprints,
  Minus,
  PackageX,
  Plus,
  TriangleAlert,
  Undo2,
  Utensils,
  Wine,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactElement, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DestinationTag, QrStatusPill, QrTimer, VegMark } from '@/components/QrStatus';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import useNow from '@/hooks/useNow';
import { formatClockTime, formatRupees, formatWaiting, initialsOf, timerTone } from '@/lib/qr';
import {
  useApproveQrRound,
  useQrOnMyWay,
  useQrQueue,
  useQrRound,
  useRejectQrRound,
} from '@/services/api/requests/qr-orders';

import { QueueOrderCard } from './QueueCard';

type Edit = { quantity: number; outOfStock: boolean };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Order review (C3a–C3d): edit, approve & send, reject with reason, or "I’m on my way". */
export default function QrRoundReview({ roundId }: { roundId: string }): ReactElement {
  const round = useQrRound(roundId);
  const queue = useQrQueue('mine');
  const now = useNow(1000);

  return (
    <div className="lg:grid lg:min-h-[calc(100svh-3.5rem)] lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="hidden border-r lg:block" aria-label="Awaiting approval">
        <div className="px-3.5 pt-4">
          <h2 className="mb-2 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            Awaiting approval{' '}
            <span className="ml-1 rounded-full border px-2 py-0.5 tracking-normal normal-case">
              {queue.data?.awaiting.length ?? 0}
            </span>
          </h2>
          <div className="flex flex-col gap-2">
            {queue.data?.awaiting.map((card) => (
              <Link
                key={card.roundId}
                href={`/qr-orders/rounds/${card.roundId}`}
                className="rounded-[10px]"
              >
                <QueueOrderCard
                  card={card}
                  now={now}
                  escalationMinutes={queue.data.escalationMinutes}
                  readOnly={!card.canAct}
                  selected={card.roundId === roundId}
                />
              </Link>
            ))}
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        {round.isPending ? (
          <ReviewSkeleton />
        ) : round.isError || !round.data ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <TriangleAlert className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-muted-foreground">This order couldn’t be loaded.</p>
            <Link href="/qr-orders" className={buttonVariants({ variant: 'outline' })}>
              Back to QR orders
            </Link>
          </div>
        ) : (
          <ReviewBody key={round.data.roundId + round.data.status} detail={round.data} now={now} />
        )}
      </div>
    </div>
  );
}

function ReviewBody({ detail, now }: { detail: QrRoundDetail; now: number }): ReactElement {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [rejectOpen, setRejectOpen] = useState(false);
  const approve = useApproveQrRound(detail.roundId);
  const onMyWay = useQrOnMyWay(detail.roundId);
  const waiting = detail.status === 'awaiting' || detail.status === 'escalated';
  const actionable = detail.canAct && waiting;
  const busy = approve.isPending || onMyWay.isPending;
  const tone = timerTone(
    detail.submittedAt,
    detail.escalationMinutes,
    detail.escalatedAt !== null,
    now,
  );

  const lines = detail.items.map((item) => {
    const edit = edits[item.id];
    const quantity = edit ? (edit.outOfStock ? 0 : edit.quantity) : item.quantity;
    const outOfStock = edit?.outOfStock ?? item.status === 'OUT_OF_STOCK';
    return { ...item, quantity, outOfStock, removed: quantity === 0 && !outOfStock };
  });
  const kitchen = lines.filter((line) => line.destination === 'KITCHEN' && line.quantity > 0);
  const bar = lines.filter((line) => line.destination === 'BAR' && line.quantity > 0);
  const count = (items: typeof lines): number =>
    items.reduce((sum, line) => sum + line.quantity, 0);
  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + Number(line.unitPrice) * line.quantity, 0);
    const rate = Number(detail.totals.gstRate);
    const gst = roundMoney((subtotal * rate) / 100);
    return { subtotal, gst, total: Math.round(subtotal + gst), rate };
  }, [lines, detail.totals.gstRate]);
  const changed = Object.keys(edits).length > 0;

  function setQuantity(id: string, quantity: number): void {
    setEdits((current) => ({
      ...current,
      [id]: { quantity: Math.max(0, Math.min(20, quantity)), outOfStock: false },
    }));
  }
  function flag(id: string, outOfStock: boolean, original: number): void {
    setEdits((current) => {
      const next = { ...current };
      if (outOfStock) next[id] = { quantity: 0, outOfStock: true };
      else if (next[id]?.quantity === original || next[id]?.outOfStock) delete next[id];
      return next;
    });
  }

  async function handleApprove(): Promise<void> {
    try {
      await approve.mutateAsync({
        items: Object.entries(edits).map(([id, edit]) => ({ id, ...edit })),
      });
      toast.success(`Table ${detail.table.number} sent to the kitchen`);
      router.push('/qr-orders');
    } catch {
      // The mutation hook shows the error and refetches.
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 flex min-h-14 items-center gap-2.5 border-b bg-background px-2 lg:min-h-16 lg:px-6">
        <Link
          href="/qr-orders"
          aria-label="Back to QR orders"
          className={buttonVariants({ variant: 'ghost', size: 'icon-lg' })}
        >
          <ArrowLeft aria-hidden />
        </Link>
        <h1 className="flex-1 text-lg font-bold lg:text-[22px]">
          Table {detail.table.number} · Round {detail.roundNumber}
        </h1>
        <span className="hidden lg:inline-flex">
          <QrStatusPill status={detail.status} />
        </span>
        {waiting && <QrTimer tone={tone} text={formatWaiting(detail.submittedAt, now)} />}
      </div>

      <div className="mx-auto max-w-3xl px-4 lg:px-6">
        <div className="flex items-center gap-2.5 border-b py-3">
          <span className="flex size-8 items-center justify-center rounded-full border bg-muted text-xs font-bold">
            {initialsOf(detail.guests[0]?.name ?? '?')}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <b>
              {detail.guests.length} {detail.guests.length === 1 ? 'guest' : 'guests'}
            </b>
            <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
              {guestNames(detail.guests.map((guest) => guest.name))}
              <span className="lg:hidden">
                · <QrStatusPill status={detail.status} />
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-3">
          {kitchen.length > 0 && (
            <DestinationTag destination="KITCHEN">
              <Utensils className="size-3" aria-hidden /> Kitchen · {count(kitchen)}{' '}
              {count(kitchen) === 1 ? 'item' : 'items'}
            </DestinationTag>
          )}
          {bar.length > 0 && (
            <DestinationTag destination="BAR">
              <Wine className="size-3" aria-hidden /> Bar · {count(bar)}{' '}
              {count(bar) === 1 ? 'item' : 'items'}
            </DestinationTag>
          )}
        </div>

        {detail.note && (
          <div
            className="mt-3 flex items-center gap-2 rounded-[9px] px-3 py-2.5 text-[13px] font-semibold"
            style={{ background: 'var(--qs-aw-b)', color: 'var(--qs-aw-f)' }}
          >
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            <span>Guest note: “{detail.note}”</span>
          </div>
        )}

        {detail.status === 'rejected' && detail.rejectReason && (
          <div
            className="mt-3 rounded-[9px] border p-3 text-sm"
            style={{ borderColor: 'var(--qs-rj)' }}
          >
            Rejected: “{detail.rejectReason}”
          </div>
        )}
        {detail.approvedAt && detail.approvedBy && (
          <p className="mt-3 text-sm text-muted-foreground">
            Approved by {detail.approvedBy.name} at {formatClockTime(detail.approvedAt)}
          </p>
        )}
        {detail.onMyWayAt && waiting && (
          <p className="mt-3 text-sm text-muted-foreground">
            On the way since {formatClockTime(detail.onMyWayAt)} · escalation timer paused
          </p>
        )}

        <ul className="m-0 list-none p-0">
          {lines.map((line) => {
            const original =
              detail.items.find((item) => item.id === line.id)?.quantity ?? line.quantity;
            return (
              <li
                key={line.id}
                className="border-b py-3.5"
                style={{ opacity: line.outOfStock ? 0.9 : 1 }}
              >
                <div className="flex items-start gap-2.5">
                  <VegMark isVeg={line.isVeg} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className={cn((line.outOfStock || line.removed) && 'line-through')}>
                        {line.name}
                      </b>
                      <DestinationTag destination={line.destination} />
                      {!line.available && !line.outOfStock && (
                        <span className="text-xs font-semibold" style={{ color: 'var(--qs-rj-f)' }}>
                          Sold out on the menu
                        </span>
                      )}
                    </div>
                    <span className="text-[13px] text-muted-foreground">
                      {[
                        line.specialInstructions && `“${line.specialInstructions}”`,
                        `Added by ${line.addedBy}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <b className={cn(line.quantity === 0 && 'text-muted-foreground line-through')}>
                      {formatRupees(
                        Number(line.unitPrice) *
                          (line.quantity > 0 ? line.quantity : line.requestedQuantity),
                      )}
                    </b>
                    {actionable && (
                      <div className="flex h-10 items-center rounded-[7px] border">
                        <button
                          type="button"
                          aria-label={`One less ${line.name}`}
                          className="flex h-10 w-10 items-center justify-center disabled:opacity-40"
                          disabled={line.quantity === 0 || line.outOfStock}
                          onClick={() => setQuantity(line.id, line.quantity - 1)}
                        >
                          <Minus className="size-4" aria-hidden />
                        </button>
                        <b className="w-[26px] text-center tabular-nums" aria-live="polite">
                          {line.quantity}
                        </b>
                        <button
                          type="button"
                          aria-label={`One more ${line.name}`}
                          className="flex h-10 w-10 items-center justify-center disabled:opacity-40"
                          disabled={line.outOfStock || line.quantity >= 20}
                          onClick={() => setQuantity(line.id, line.quantity + 1)}
                        >
                          <Plus className="size-4" aria-hidden />
                        </button>
                      </div>
                    )}
                    {!actionable && (
                      <span className="text-sm text-muted-foreground">× {line.quantity}</span>
                    )}
                  </div>
                </div>
                {line.outOfStock ? (
                  <div
                    className="mt-2 flex items-center gap-2 rounded-[7px] px-2.5 py-2 text-[13px] font-semibold"
                    style={{ background: 'var(--qs-aw-b)', color: 'var(--qs-aw-f)' }}
                  >
                    <PackageX className="size-4" aria-hidden /> Flagged out of stock · guest will be
                    told
                    {actionable && (
                      <button
                        type="button"
                        className="ml-auto inline-flex min-h-8 items-center gap-1 underline"
                        onClick={() => flag(line.id, false, original)}
                      >
                        <Undo2 className="size-3.5" aria-hidden /> Undo
                      </button>
                    )}
                  </div>
                ) : (
                  actionable && (
                    <button
                      type="button"
                      className="mt-1 ml-[26px] inline-flex min-h-9 items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
                      onClick={() => flag(line.id, true, original)}
                    >
                      <PackageX className="size-4" aria-hidden /> Flag out of stock
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-1.5 py-3.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {changed ? 'Subtotal (after changes)' : 'Subtotal'}
            </span>
            <span>{formatRupees(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">GST {totals.rate}%</span>
            <span>{formatRupees(totals.gst)}</span>
          </div>
          <div className="flex justify-between">
            <b>Total</b>
            <b className="text-lg">{formatRupees(totals.total)}</b>
          </div>
        </div>
      </div>

      {actionable && (
        <div className="sticky bottom-0 z-20 border-t bg-background px-4 pt-3 pb-4 lg:px-6 lg:py-3.5">
          <div className="mx-auto flex max-w-3xl flex-col gap-2.5 lg:flex-row-reverse">
            <Button
              className="min-h-14 w-full text-base lg:flex-1"
              disabled={busy || lines.every((line) => line.quantity === 0)}
              onClick={() => void handleApprove()}
            >
              <Check aria-hidden /> {approve.isPending ? 'Sending…' : 'Approve & send to kitchen'}
            </Button>
            <div className="flex gap-2.5">
              <Button
                variant="outline"
                className="min-h-12 flex-1 lg:min-h-14"
                disabled={busy || detail.onMyWayAt !== null}
                onClick={() =>
                  void onMyWay.mutateAsync().then(
                    () => toast.success('Guest told you’re on your way'),
                    () => undefined,
                  )
                }
              >
                <Footprints aria-hidden /> {detail.onMyWayAt ? 'On my way' : 'I’m on my way'}
              </Button>
              <Button
                variant="outline"
                className="min-h-12 flex-1 lg:min-h-14"
                style={{
                  borderColor: 'var(--qs-rj)',
                  color: 'var(--qs-rj-f)',
                  background: 'var(--qs-rj-b)',
                }}
                disabled={busy}
                onClick={() => setRejectOpen(true)}
              >
                <X aria-hidden /> Reject…
              </Button>
            </div>
          </div>
        </div>
      )}

      <RejectSheet
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        roundId={detail.roundId}
        tableNumber={detail.table.number}
        onRejected={() => router.push('/qr-orders')}
      />
    </div>
  );
}

function guestNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** Reject with a preset reason plus a message the guest reads (C3c). */
function RejectSheet({
  open,
  onOpenChange,
  roundId,
  tableNumber,
  onRejected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId: string;
  tableNumber: string;
  onRejected: () => void;
}): ReactElement {
  const reject = useRejectQrRound(roundId);
  const [preset, setPreset] = useState<string>(QR_REJECT_REASONS[0]);
  const [message, setMessage] = useState('');
  const reason = message.trim() || preset;

  async function submit(): Promise<void> {
    try {
      await reject.mutateAsync({ reason });
      toast.success(`Table ${tableNumber} has been told`);
      onOpenChange(false);
      onRejected();
    } catch {
      // Hook shows the error.
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-w-xl rounded-t-2xl px-4 pt-2.5 pb-5"
      >
        <div className="mx-auto mb-1 h-[5px] w-10 rounded-full bg-border" aria-hidden />
        <SheetTitle className="text-lg font-bold">Reject this order</SheetTitle>
        <SheetDescription>
          The guest sees your reason on their phone. Nothing goes to the kitchen.
        </SheetDescription>
        <fieldset className="m-0 border-0 p-0">
          <legend className="sr-only">Reason</legend>
          {QR_REJECT_REASONS.map((option) => (
            <label
              key={option}
              className="flex min-h-[52px] cursor-pointer items-center gap-3 border-b"
            >
              <input
                type="radio"
                name="reject-reason"
                value={option}
                checked={preset === option}
                onChange={() => setPreset(option)}
                className="size-[22px] accent-[var(--primary)]"
              />
              <span className="font-medium">{option}</span>
            </label>
          ))}
        </fieldset>
        <label className="sr-only" htmlFor="reject-message">
          Message to the guest
        </label>
        <textarea
          id="reject-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={255}
          rows={3}
          placeholder="Sorry, the paneer tikka is out today."
          className="min-h-[72px] w-full rounded-[7px] border bg-background px-3 py-2.5 text-sm"
        />
        <div className="flex gap-2.5">
          <Button
            variant="outline"
            className="min-h-[52px] flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="min-h-[52px] flex-[2]"
            style={{
              borderColor: 'var(--qs-rj)',
              color: 'var(--qs-rj-f)',
              background: 'var(--qs-rj-b)',
            }}
            disabled={reject.isPending}
            onClick={() => void submit()}
          >
            {reject.isPending ? 'Rejecting…' : 'Reject and tell guest'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReviewSkeleton(): ReactElement {
  return (
    <div
      className="mx-auto flex max-w-3xl flex-col gap-3 p-4"
      aria-busy="true"
      aria-label="Loading order"
    >
      <div className="qr-skeleton h-7 w-48" />
      <div className="qr-skeleton h-10 w-full" />
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="qr-skeleton h-16 w-full" />
      ))}
    </div>
  );
}
