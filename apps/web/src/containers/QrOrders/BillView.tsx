'use client';

import type { QrShare, QrStaffBill } from '@rms/api-contract';
import {
  ArrowLeft,
  Banknote,
  CheckCheck,
  Clock,
  CreditCard,
  Printer,
  QrCode,
  Receipt,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useState } from 'react';
import { toast } from 'sonner';

import { QrStatusPill } from '@/components/QrStatus';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import useNow from '@/hooks/useNow';
import { formatClockTime, formatRupees, initialsOf, minutesAgo } from '@/lib/qr';
import {
  useCollectQrAtTable,
  useFinalizeQrPayment,
  useQrBill,
  useRecordQrSharePayment,
  useUpiQrImage,
} from '@/services/api/requests/qr-orders';

type Method = 'UPI' | 'CASH' | 'CARD';
const METHOD_LABEL: Record<Method, string> = { UPI: 'UPI', CASH: 'Cash', CARD: 'Card' };

const SPLIT_TITLE: Record<NonNullable<QrStaffBill['splitMode']>, (n: number) => string> = {
  FULL: () => 'Paying in full',
  EQUAL: (n) => `Split · equally between ${n}`,
  BY_ITEM: () => 'Split · by item',
  CUSTOM: () => 'Split · custom amounts',
};

/** A QR table's bill and per-share payment status (C4); payments confirmed manually. */
export default function QrBillView({ sessionId }: { sessionId: string }): ReactElement {
  const bill = useQrBill(sessionId);
  const finalize = useFinalizeQrPayment(sessionId);
  const now = useNow(30_000);
  const [collect, setCollect] = useState<{ share: QrShare | null } | null>(null);
  const data = bill.data;
  const readyToClose = Boolean(
    data && !data.settled && Number(data.paid) > 0 && data.paid === data.payable,
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex min-h-14 items-center gap-2.5 border-b px-2">
        <Link
          href="/qr-orders"
          aria-label="Back to QR orders"
          className={buttonVariants({ variant: 'ghost', size: 'icon-lg' })}
        >
          <ArrowLeft aria-hidden />
        </Link>
        <h1 className="flex-1 text-lg font-bold">Bill · Table {data?.table.number ?? ''}</h1>
      </div>
      {bill.isPending ? (
        <div className="flex flex-col gap-3 p-4" aria-busy="true">
          <div className="qr-skeleton h-28 w-full" />
          <div className="qr-skeleton h-12 w-full" />
          <div className="qr-skeleton h-12 w-full" />
        </div>
      ) : !data ? (
        <p className="p-8 text-center text-muted-foreground">This bill couldn’t be loaded.</p>
      ) : (
        <>
          <div className="qr-slidein mx-4 mt-3.5 rounded-[10px] border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Receipt className="size-5" aria-hidden />
              </div>
              <div className="flex flex-col">
                <b className="text-base">
                  {data.requestedAt
                    ? `Table ${data.table.number} requested the bill`
                    : `Table ${data.table.number}`}
                </b>
                <span className="text-[13px] text-muted-foreground">
                  {data.requestedAt ? `${minutesAgo(data.requestedAt, now)} · ` : ''}
                  {data.roundCount} {data.roundCount === 1 ? 'round' : 'rounds'} · {data.guestCount}{' '}
                  {data.guestCount === 1 ? 'guest' : 'guests'}
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3 border-t pt-3.5">
              <span className="text-[13px] text-muted-foreground">
                Total · CGST {formatRupees(data.totals.cgst, { paise: 'always' })} · SGST{' '}
                {formatRupees(data.totals.sgst, { paise: 'always' })}
                {Number(data.totals.roundOff) !== 0 && ` · round off ${data.totals.roundOff}`}
              </span>
              <b className="text-[22px]">{formatRupees(data.payable)}</b>
            </div>
          </div>

          {data.settled ? (
            <div
              className="qr-pop mx-4 mt-4 flex items-center gap-3 rounded-[10px] p-4"
              style={{ background: 'var(--qs-rd-b)', color: 'var(--qs-rd-f)' }}
            >
              <CheckCheck className="size-6" aria-hidden />
              <div>
                <b>All paid</b>
                <p className="text-sm">The bill is closed and the table is marked for cleaning.</p>
              </div>
            </div>
          ) : null}

          <div className="px-4">
            <h2 className="mt-[18px] mb-2 text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
              {data.splitMode ? SPLIT_TITLE[data.splitMode](data.shares.length) : 'Not split yet'}
            </h2>
            {data.shares.length === 0 && (
              <p className="text-sm text-muted-foreground">
                The guests haven’t split the bill. Collect the full amount below.
              </p>
            )}
            <ul className="m-0 list-none p-0">
              {data.shares.map((share) => (
                <li key={share.id} className="flex items-center gap-2.5 border-b py-3">
                  <span className="flex size-8 items-center justify-center rounded-full border bg-muted text-xs font-bold">
                    {initialsOf(share.label)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <b className="truncate">{share.label}</b>
                    {share.status === 'PAID' && share.paidAt && (
                      <span className="text-xs text-muted-foreground">
                        Paid at {formatClockTime(share.paidAt)}
                      </span>
                    )}
                  </div>
                  <b>{formatRupees(share.paidAmount ?? share.amount)}</b>
                  {share.status === 'PAID' ? (
                    <QrStatusPill
                      status="ready"
                      label={`Paid · ${METHOD_LABEL[share.paymentMethod ?? 'CASH']}`}
                    />
                  ) : (
                    <>
                      <QrStatusPill
                        status="awaiting"
                        label={
                          share.status === 'PAYMENT_REQUESTED' && share.requestedMethod
                            ? `Wants to pay · ${METHOD_LABEL[share.requestedMethod]}`
                            : 'Unpaid'
                        }
                      />
                      {!data.settled && !readyToClose && (
                        <Button
                          size="sm"
                          className="min-h-10"
                          onClick={() => setCollect({ share })}
                        >
                          Collect
                        </Button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {!data.settled && Number(data.paid) > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                Paid {formatRupees(data.paid)} · {formatRupees(data.remaining)} left
              </p>
            )}
          </div>

          <div className="sticky bottom-0 mt-6 flex flex-col border-t bg-background px-4 pt-3 pb-4">
            {readyToClose && (
              <Button
                className="min-h-14 w-full text-base"
                disabled={finalize.isPending}
                onClick={() => finalize.mutate()}
              >
                <CheckCheck aria-hidden /> {finalize.isPending ? 'Closing…' : 'Close paid bill'}
              </Button>
            )}
            {!data.settled && !readyToClose && (
              <Button
                className="min-h-14 w-full text-base"
                onClick={() => setCollect({ share: null })}
              >
                <Banknote aria-hidden /> Collect at table…
              </Button>
            )}
            <div className="mt-2.5 flex gap-2.5">
              {data.billId ? (
                <Link
                  href={`/billing/${data.billId}/invoice`}
                  className={buttonVariants({ variant: 'outline', className: 'min-h-12 flex-1' })}
                >
                  <Printer aria-hidden /> Print bill
                </Link>
              ) : (
                <Button
                  variant="outline"
                  className="min-h-12 flex-1"
                  onClick={() => window.print()}
                >
                  <Printer aria-hidden /> Print bill
                </Button>
              )}
              <Link
                href={data.billId ? `/billing/${data.billId}` : `/orders/tables/${data.table.id}`}
                className={buttonVariants({ variant: 'outline', className: 'min-h-12 flex-1' })}
              >
                Open in Billing
              </Link>
            </div>
          </div>

          <CollectSheet
            open={collect !== null}
            onOpenChange={(open) => !open && setCollect(null)}
            bill={data}
            share={collect?.share ?? null}
          />
        </>
      )}
    </div>
  );
}

/**
 * Collect one share (or the remainder). For UPI the restaurant's uploaded QR is shown full-size for
 * the guest to scan; the captain confirms the amount once they see it received.
 */
function CollectSheet({
  open,
  onOpenChange,
  bill,
  share,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill: QrStaffBill;
  share: QrShare | null;
}): ReactElement {
  const record = useRecordQrSharePayment();
  const collect = useCollectQrAtTable(bill.sessionId);
  const upi = useUpiQrImage(open && bill.hasUpiQr);
  const defaultAmount = share ? share.amount : bill.remaining;
  const [method, setMethod] = useState<Method>(share?.requestedMethod ?? 'UPI');
  const [amount, setAmount] = useState(defaultAmount);
  const [reference, setReference] = useState('');
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${share?.id ?? 'rest'}-${open}`;
  if (key !== lastKey) {
    setLastKey(key);
    setMethod(share?.requestedMethod ?? 'UPI');
    setAmount(defaultAmount);
    setReference('');
  }
  const pending = record.isPending || collect.isPending;
  const formatOk = /^\d{1,10}(\.\d{1,2})?$/.test(amount) && Number(amount) > 0;
  // Never more than is still owed: tips are out of scope and totals must match the bill.
  const tooMuch = formatOk && Number(amount) > Number(bill.remaining);
  const valid = formatOk && !tooMuch;

  async function confirm(): Promise<void> {
    const input = {
      method,
      amount: Number(amount).toFixed(2),
      ...(reference.trim() && { referenceNumber: reference.trim() }),
    };
    try {
      const result = share
        ? await record.mutateAsync({ shareId: share.id, input })
        : await collect.mutateAsync(input);
      toast.success(
        result.settled
          ? 'All paid. Table marked for cleaning.'
          : `${formatRupees(input.amount)} recorded`,
      );
      onOpenChange(false);
    } catch {
      // The hook shows the error.
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-auto max-h-[92svh] max-w-xl overflow-y-auto rounded-t-2xl px-4 pt-2.5 pb-5"
      >
        <div className="mx-auto mb-1 h-[5px] w-10 rounded-full bg-border" aria-hidden />
        <SheetTitle className="text-lg font-bold">
          {share ? `Collect from ${share.label}` : `Collect at Table ${bill.table.number}`}
        </SheetTitle>
        <SheetDescription>Confirm only once you have seen the payment arrive.</SheetDescription>
        <div role="radiogroup" aria-label="Payment method" className="flex gap-2">
          {(['UPI', 'CASH', 'CARD'] as const).map((option) => {
            const Icon = option === 'UPI' ? QrCode : option === 'CASH' ? Banknote : CreditCard;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={method === option}
                onClick={() => setMethod(option)}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border text-sm font-semibold aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground"
              >
                <Icon className="size-4" aria-hidden /> {METHOD_LABEL[option]}
              </button>
            );
          })}
        </div>
        {method === 'UPI' &&
          (bill.hasUpiQr ? (
            <div className="flex flex-col items-center gap-2">
              {upi.data ? (
                // Object URL of the uploaded image; next/image can't optimise blob: URLs.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={upi.data}
                  alt="Restaurant UPI QR code"
                  className="size-64 rounded-xl border bg-white object-contain p-2"
                />
              ) : (
                <div className="qr-skeleton size-64" aria-label="Loading UPI QR code" />
              )}
              <span className="text-sm text-muted-foreground">
                Ask the guest to scan and pay{' '}
                <b className="text-foreground">{valid ? formatRupees(amount) : ''}</b>
              </span>
            </div>
          ) : (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              No UPI QR uploaded yet. An owner or manager can add it in Settings → QR ordering.
            </p>
          ))}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Amount received (₹)
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
            className="h-11 rounded-md border bg-background px-3 text-base"
            aria-invalid={tooMuch}
            aria-describedby={tooMuch ? 'collect-amount-error' : undefined}
          />
          {tooMuch && (
            <span id="collect-amount-error" className="text-xs font-normal text-destructive">
              Only {formatRupees(bill.remaining)} is left to pay.
            </span>
          )}
        </label>
        {method !== 'CASH' && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {method === 'UPI' ? 'UPI reference (optional)' : 'Card reference (optional)'}
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={255}
              className="h-11 rounded-md border bg-background px-3 text-base"
            />
          </label>
        )}
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
            disabled={!valid || pending}
            onClick={() => void confirm()}
          >
            <Clock aria-hidden className={pending ? 'animate-spin' : 'hidden'} />
            {pending ? 'Recording…' : `Confirm ${valid ? formatRupees(amount) : ''} received`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
