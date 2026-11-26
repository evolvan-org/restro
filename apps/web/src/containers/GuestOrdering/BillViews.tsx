'use client';

import type { QrGuestBill, QrSessionResponse, QrShare } from '@rms/api-contract';
import {
  Banknote,
  Check,
  CircleCheck,
  Clock,
  Download,
  Info,
  LoaderCircle,
  QrCode,
} from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';

import { QrStatusPill } from '@/components/QrStatus';
import { formatClockTime, formatRupees } from '@/lib/qr';

import { signed } from './CartView';
import { Stepper, TopBar } from './parts';

const METHOD: Record<'UPI' | 'CASH' | 'CARD', string> = {
  UPI: 'UPI',
  CASH: 'Cash at table',
  CARD: 'Card at table',
};

/** Itemised bill for every round (G6a). */
export function BillView({
  session,
  bill,
  tableNumber,
  captainName,
  onBack,
  onSplit,
  onPayFull,
  busy,
}: {
  session: QrSessionResponse;
  bill: QrGuestBill;
  tableNumber: string;
  captainName: string;
  onBack: () => void;
  onSplit: () => void;
  onPayFull: () => void;
  busy: boolean;
}): ReactElement {
  return (
    <div>
      <TopBar title={`Bill · Table ${tableNumber}`} onBack={onBack} />
      {session.billRequestedAt && (
        <div
          className="qr-slidein row"
          style={{
            gap: 12,
            margin: '12px 16px 14px',
            padding: '12px 14px',
            borderRadius: 14,
            background: 'var(--bs)',
          }}
          role="status"
        >
          <Info size={20} style={{ color: 'var(--brand)', flex: 'none' }} aria-hidden />
          <span style={{ fontSize: 14 }}>
            <b>{captainName} has your bill request</b> and will be right over if you need anything.
          </span>
        </div>
      )}
      <div
        className="gc"
        style={{ margin: session.billRequestedAt ? '0 16px' : '14px 16px 0', padding: '12px 16px' }}
      >
        <div className="row" style={{ gap: 8, marginBottom: 4 }}>
          <b style={{ flex: 1 }}>
            Table {tableNumber} · {bill.roundCount} {bill.roundCount === 1 ? 'round' : 'rounds'}
          </b>
        </div>
        {bill.lines.map((line) => (
          <div
            key={line.orderItemId}
            className="row"
            style={{ justifyContent: 'space-between', padding: '7px 0', gap: 10 }}
          >
            <span style={{ flex: 1 }}>
              <span className="gm">{line.quantity} ×</span> {line.name}
            </span>
            <span>{formatRupees(line.lineTotal)}</span>
          </div>
        ))}
        <div
          className="col"
          style={{ borderTop: '1px dashed #CBB9A6', marginTop: 6, paddingTop: 8, gap: 4 }}
        >
          <Row label="Subtotal" value={formatRupees(bill.totals.subtotal)} />
          {Number(bill.totals.discount) > 0 && (
            <Row label="Discount" value={`−${formatRupees(bill.totals.discount)}`} />
          )}
          <Row
            label={`CGST ${Number(bill.totals.gstRate) / 2}%`}
            value={formatRupees(bill.totals.cgst, { paise: 'always' })}
          />
          <Row
            label={`SGST ${Number(bill.totals.gstRate) / 2}%`}
            value={formatRupees(bill.totals.sgst, { paise: 'always' })}
          />
          <Row label="Round off" value={signed(bill.totals.roundOff)} />
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <b style={{ fontSize: 17 }}>Total</b>
            <b style={{ fontSize: 22 }}>{formatRupees(bill.payable)}</b>
          </div>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <button type="button" className="gb" onClick={onSplit}>
          Split the bill
        </button>
        <button
          type="button"
          className="gb o"
          style={{ marginTop: 10 }}
          disabled={busy || Number(bill.paid) > 0}
          onClick={onPayFull}
        >
          <QrCode size={20} aria-hidden /> Pay full amount · {formatRupees(bill.payable)}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className="gm">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ShareRow({ share }: { share: QrShare }): ReactElement {
  const initial = share.isMine ? 'Y' : (share.label[0] ?? '?').toUpperCase();
  return (
    <div
      className="row"
      style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--gl)' }}
    >
      <div
        aria-hidden
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: share.isMine ? 'var(--brand)' : 'var(--bs)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          color: share.isMine ? '#fff' : 'var(--brand)',
          flex: 'none',
        }}
      >
        {initial}
      </div>
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <b>{share.isMine ? `${share.label} (you)` : share.label}</b>
        <span className="gm" style={{ fontSize: 13 }}>
          {share.status === 'PAID' && share.paidAt
            ? `Paid at ${formatClockTime(share.paidAt)}`
            : share.status === 'PAYMENT_REQUESTED'
              ? 'Waiting for the server'
              : share.isMine
                ? 'Your share'
                : share.guestId
                  ? 'Not paid yet'
                  : 'Not claimed'}
        </span>
      </div>
      <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
        <b>{formatRupees(share.paidAmount ?? share.amount)}</b>
        {share.status === 'PAID' ? (
          <QrStatusPill
            status="ready"
            label={`Paid · ${share.paymentMethod === 'UPI' ? 'UPI' : share.paymentMethod === 'CARD' ? 'Card' : 'Cash'}`}
          />
        ) : (
          <QrStatusPill
            status="awaiting"
            label={share.status === 'PAYMENT_REQUESTED' ? 'Paying' : 'Unpaid'}
          />
        )}
      </div>
    </div>
  );
}

type Mode = 'EQUAL' | 'BY_ITEM' | 'CUSTOM';

/** Split the bill (G6b equally · G6c my items · G6d custom amount). */
export function SplitView({
  session,
  bill,
  captainName,
  onBack,
  onSplit,
  onPay,
  busy,
  error,
}: {
  session: QrSessionResponse;
  bill: QrGuestBill;
  captainName: string;
  onBack: () => void;
  onSplit: (request: SplitRequest) => Promise<QrSessionResponse | null>;
  onPay: (shareId: string, method: 'UPI' | 'CASH') => void;
  busy: boolean;
  error: string | null;
}): ReactElement {
  const initialMode: Mode =
    bill.splitMode === 'BY_ITEM' || bill.splitMode === 'CUSTOM' ? bill.splitMode : 'EQUAL';
  const [mode, setMode] = useState<Mode>(initialMode);
  const equalShares = bill.splitMode === 'EQUAL' ? bill.shares.length : 0;
  const [people, setPeople] = useState(Math.max(2, equalShares || session.guests.length));
  const myShare = bill.shares.find((share) => share.isMine && share.status !== 'PAID');
  const firstUnclaimed = bill.shares.find((share) => !share.guestId && share.status === 'UNPAID');
  const payable = Number(bill.payable);
  const preview = Math.floor(payable / people) + (payable % people > 0 ? 1 : 0);
  const anyPaid = bill.shares.some((share) => share.status === 'PAID');
  const equalApplied = bill.splitMode === 'EQUAL' && equalShares === people;

  // --- by item ---
  const claimedByOthers = useMemo(() => {
    const map = new Map<string, { quantity: number; who: string[] }>();
    for (const share of bill.shares) {
      if (share.isMine && share.status !== 'PAID') continue;
      for (const item of share.claimedItems ?? []) {
        const entry = map.get(item.orderItemId) ?? { quantity: 0, who: [] };
        entry.quantity += item.quantity;
        entry.who.push(share.label);
        map.set(item.orderItemId, entry);
      }
    }
    return map;
  }, [bill.shares]);
  const [picked, setPicked] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (myShare?.claimedItems ?? []).map((item) => [item.orderItemId, item.quantity]),
    ),
  );
  const pickedSubtotal = bill.lines.reduce(
    (sum, line) => sum + Number(line.unitPrice) * (picked[line.orderItemId] ?? 0),
    0,
  );
  const subtotal = Number(bill.totals.subtotal);
  const byItemAmount = subtotal > 0 ? Math.round((pickedSubtotal * payable) / subtotal) : 0;

  // --- custom ---
  const [custom, setCustom] = useState(
    bill.splitMode === 'CUSTOM' && myShare ? String(Math.round(Number(myShare.amount))) : '',
  );
  const customAmount = Number(custom) || 0;
  const remaining = Number(bill.remaining);

  async function payMy(method: 'UPI' | 'CASH'): Promise<void> {
    if (mode === 'EQUAL') {
      let share = myShare ?? firstUnclaimed;
      if (!equalApplied) {
        const next = await onSplit({ mode: 'EQUAL', people });
        const shares = next?.bill?.shares ?? [];
        share =
          shares.find((s) => s.isMine && s.status !== 'PAID') ??
          shares.find((s) => !s.guestId && s.status === 'UNPAID');
      }
      if (share) onPay(share.id, method);
      return;
    }
    const next =
      mode === 'BY_ITEM'
        ? await onSplit({
            mode: 'BY_ITEM',
            items: Object.entries(picked)
              .filter(([, quantity]) => quantity > 0)
              .map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
          })
        : await onSplit({ mode: 'CUSTOM', amount: customAmount.toFixed(2) });
    const share = next?.bill?.shares.find((s) => s.isMine && s.status !== 'PAID');
    if (share) onPay(share.id, method);
  }

  const payAmount =
    mode === 'EQUAL'
      ? Number((myShare ?? firstUnclaimed)?.amount ?? preview)
      : mode === 'BY_ITEM'
        ? byItemAmount
        : customAmount;
  const canPay =
    !busy &&
    (mode === 'EQUAL'
      ? !anyPaid || equalApplied
      : mode === 'BY_ITEM'
        ? pickedSubtotal > 0
        : customAmount > 0 && customAmount <= remaining);

  return (
    <div style={{ paddingBottom: 24 }}>
      <TopBar title="Split the bill" onBack={onBack} />
      <div style={{ height: 12 }} />
      <div
        className="row"
        role="tablist"
        aria-label="How to split"
        style={{ gap: 6, padding: '0 16px' }}
      >
        {(
          [
            ['EQUAL', 'Equally'],
            ['BY_ITEM', 'My items'],
            ['CUSTOM', 'Custom'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            className="gtab"
            style={{ flex: 1, justifyContent: 'center', padding: '0 6px' }}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'EQUAL' && (
        <>
          <div className="gc" style={{ margin: 16, padding: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="col">
                <b>How many people?</b>
                <span className="gm" style={{ fontSize: 13 }}>
                  Total {formatRupees(bill.payable)}
                </span>
              </div>
              <Stepper
                quantity={people}
                label="person"
                max={20}
                disabled={anyPaid}
                onChange={(next) => setPeople(Math.max(2, next))}
              />
            </div>
            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 14,
                background: 'var(--bs)',
                textAlign: 'center',
              }}
              aria-live="polite"
            >
              <div className="gm" style={{ fontSize: 13, fontWeight: 700 }}>
                EACH PERSON PAYS
              </div>
              <div className="fr" style={{ fontSize: 38, color: 'var(--brand)' }}>
                {formatRupees(equalApplied ? (bill.shares[0]?.amount ?? preview) : preview)}
              </div>
            </div>
          </div>
          {bill.splitMode === 'EQUAL' && bill.shares.length > 0 && (
            <div style={{ padding: '0 16px' }}>
              <div className="gm" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em' }}>
                SHARES
              </div>
              {bill.shares.map((share) => (
                <ShareRow key={share.id} share={share} />
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'BY_ITEM' && (
        <div style={{ padding: '8px 16px 0' }}>
          <div className="gm" style={{ margin: '10px 0 2px' }}>
            Tick what you had. Shared dishes can be split with others.
          </div>
          {bill.lines.map((line) => {
            const taken = claimedByOthers.get(line.orderItemId);
            const free = line.quantity - (taken?.quantity ?? 0);
            const mine = picked[line.orderItemId] ?? 0;
            const checked = mine > 0;
            return (
              <div
                key={line.orderItemId}
                className="row"
                style={{
                  gap: 12,
                  minHeight: 56,
                  borderBottom: '1px solid var(--gl)',
                  padding: '6px 0',
                }}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={`${line.quantity} × ${line.name}`}
                  disabled={free <= 0}
                  onClick={() =>
                    setPicked((current) => ({ ...current, [line.orderItemId]: checked ? 0 : free }))
                  }
                  style={{
                    width: 44,
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '-8px',
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: checked ? 'var(--brand)' : '#fff',
                      color: '#fff',
                      boxShadow: checked ? 'none' : 'inset 0 0 0 1.5px #BFAE9E',
                      opacity: free <= 0 ? 0.5 : 1,
                    }}
                  >
                    {checked && <Check size={16} strokeWidth={3} aria-hidden />}
                  </span>
                </button>
                <div className="col" style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
                  <span>
                    {checked && line.quantity > 1 ? `${mine} of ${line.quantity}` : line.quantity} ×{' '}
                    {line.name}
                  </span>
                  {taken && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>
                      {checked ? `Shared with ${taken.who.join(', ')}` : taken.who.join(', ')}
                    </span>
                  )}
                </div>
                {checked && free > 1 ? (
                  <Stepper
                    small
                    quantity={mine}
                    label={line.name}
                    max={free}
                    onChange={(next) =>
                      setPicked((current) => ({
                        ...current,
                        [line.orderItemId]: Math.max(0, Math.min(free, next)),
                      }))
                    }
                  />
                ) : (
                  <b>{formatRupees(Number(line.unitPrice) * (checked ? mine : line.quantity))}</b>
                )}
              </div>
            );
          })}
        </div>
      )}

      {mode === 'CUSTOM' && (
        <div className="gc" style={{ margin: 16, padding: 16 }}>
          <label className="col">
            <span className="gm" style={{ fontSize: 13, fontWeight: 700 }}>
              YOU PAY
            </span>
            <span className="row" style={{ gap: 8, marginTop: 6 }}>
              <span className="fr" style={{ fontSize: 38 }} aria-hidden>
                ₹
              </span>
              <input
                inputMode="numeric"
                className="fr"
                value={custom}
                onChange={(event) => setCustom(event.target.value.replace(/\D/g, '').slice(0, 7))}
                aria-label="Amount in rupees"
                style={{
                  fontSize: 38,
                  border: 0,
                  borderBottom: '2px solid var(--brand)',
                  flex: 1,
                  minWidth: 0,
                  background: 'transparent',
                  color: '#2B1A12',
                  outline: 'none',
                }}
              />
            </span>
          </label>
          <div className="gm" style={{ marginTop: 8, fontSize: 13 }}>
            {formatRupees(Math.max(0, remaining - customAmount))} left for others
            {Number(bill.paid) > 0 && ` · ${formatRupees(bill.paid)} already paid`}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--qs-rj-f)', fontWeight: 600, padding: '0 16px' }}>
          {error}
        </p>
      )}

      <div className="footer" style={{ marginTop: 16 }}>
        {mode === 'BY_ITEM' && (
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="gm">Your items + GST</span>
            <b style={{ fontSize: 20 }}>{formatRupees(byItemAmount)}</b>
          </div>
        )}
        <div className="col" style={{ gap: 10 }}>
          <button type="button" className="gb" disabled={!canPay} onClick={() => void payMy('UPI')}>
            Pay {formatRupees(payAmount)} via UPI
          </button>
          <button
            type="button"
            className="gb o s"
            style={{ minHeight: 48 }}
            disabled={!canPay}
            onClick={() => void payMy('CASH')}
          >
            <Banknote size={18} aria-hidden /> Pay at table (cash or card)
          </button>
          <div className="gm" style={{ textAlign: 'center', fontSize: 13 }}>
            {captainName} brings the restaurant’s UPI QR to your table and confirms your payment.
          </div>
        </div>
      </div>
    </div>
  );
}

type SplitRequest =
  | { mode: 'FULL' }
  | { mode: 'EQUAL'; people: number }
  | { mode: 'BY_ITEM'; items: { orderItemId: string; quantity: number }[] }
  | { mode: 'CUSTOM'; amount: string };
export type { SplitRequest };

/**
 * After "Pay": the captain is on the way with the restaurant's UPI QR (or to take cash/card). The
 * share turns paid only when they confirm it.
 */
export function PaymentPendingSheet({
  share,
  captainName,
  onClose,
}: {
  share: QrShare;
  captainName: string;
  onClose: () => void;
}): ReactElement {
  const paid = share.status === 'PAID';
  const upi = share.requestedMethod === 'UPI';
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="pay-sheet-title">
        <div
          style={{
            width: 44,
            height: 5,
            borderRadius: 3,
            background: '#D5C8BA',
            margin: '10px auto 0',
          }}
          aria-hidden
        />
        <div
          className="col"
          style={{ alignItems: 'center', padding: '14px 24px 22px', gap: 12, textAlign: 'center' }}
          aria-live="polite"
        >
          <h2 id="pay-sheet-title" className="fr" style={{ fontSize: 22 }}>
            {paid ? 'Paid. Thank you!' : `Pay ${formatRupees(share.amount)}`}
          </h2>
          {paid ? (
            <CircleCheck
              size={64}
              style={{ color: 'var(--qs-rd)' }}
              className="qr-pop"
              aria-hidden
            />
          ) : (
            <div
              style={{
                width: 112,
                height: 112,
                borderRadius: '50%',
                background: 'var(--bs)',
                color: 'var(--brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-hidden
            >
              {upi ? (
                <QrCode size={56} strokeWidth={1.8} />
              ) : (
                <Banknote size={56} strokeWidth={1.8} />
              )}
            </div>
          )}
          <p className="gm">
            {paid
              ? `${captainName} confirmed your payment of ${formatRupees(share.paidAmount ?? share.amount)}.`
              : upi
                ? `${captainName} is coming over with the restaurant’s UPI QR. Scan it with any UPI app to pay.`
                : `${captainName} is coming over to take your payment.`}
          </p>
          {!paid && (
            <div className="row" style={{ gap: 8, color: 'var(--mg)', fontSize: 13 }}>
              <LoaderCircle size={16} className="animate-spin" aria-hidden /> Waiting for payment…
            </div>
          )}
          <button
            type="button"
            className={paid ? 'gb' : 'gb o'}
            style={{ marginTop: 4 }}
            onClick={onClose}
          >
            {paid ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </>
  );
}

/** All paid (G6e) with a downloadable receipt. */
export function PaidView({
  bill,
  restaurantName,
  tableNumber,
}: {
  bill: QrGuestBill;
  restaurantName: string;
  tableNumber: string;
}): ReactElement {
  function downloadReceipt(): void {
    const lines = [
      restaurantName,
      `Table ${tableNumber} · ${new Date().toLocaleString('en-IN')}`,
      '',
      ...bill.lines.map(
        (line) => `${line.quantity} × ${line.name}`.padEnd(32) + formatRupees(line.lineTotal),
      ),
      '',
      'Subtotal'.padEnd(32) + formatRupees(bill.totals.subtotal),
      `CGST ${Number(bill.totals.gstRate) / 2}%`.padEnd(32) +
        formatRupees(bill.totals.cgst, { paise: 'always' }),
      `SGST ${Number(bill.totals.gstRate) / 2}%`.padEnd(32) +
        formatRupees(bill.totals.sgst, { paise: 'always' }),
      'Round off'.padEnd(32) + signed(bill.totals.roundOff),
      'Total'.padEnd(32) + formatRupees(bill.payable),
      '',
      ...bill.shares
        .filter((share) => share.status === 'PAID')
        .map(
          (share) =>
            `${share.label} · ${share.paymentMethod ?? ''}`.padEnd(32) +
            formatRupees(share.paidAmount ?? share.amount),
        ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt-table-${tableNumber}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div
        className="col"
        style={{ alignItems: 'center', textAlign: 'center', padding: '70px 28px 0', gap: 14 }}
      >
        <div
          className="qr-pop"
          style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            background: 'var(--qs-rd)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-hidden
        >
          <Check size={52} strokeWidth={3} />
        </div>
        <h1 className="fr" style={{ fontSize: 30, lineHeight: 1.1 }}>
          All paid. Thank you!
        </h1>
        <p className="gm" style={{ fontSize: 16 }}>
          Table {tableNumber} is settled. We hope you enjoyed your meal at {restaurantName}.
        </p>
      </div>
      {bill.shares.some((share) => share.status === 'PAID') && (
        <div className="gc" style={{ margin: '26px 16px 0', padding: '6px 16px' }}>
          {bill.shares
            .filter((share) => share.status === 'PAID')
            .map((share) => (
              <div
                key={share.id}
                className="row"
                style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--gl)' }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: share.isMine ? 'var(--brand)' : 'var(--bs)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    color: share.isMine ? '#fff' : 'var(--brand)',
                  }}
                >
                  {share.isMine ? 'Y' : (share.label[0] ?? '?').toUpperCase()}
                </div>
                <div className="col" style={{ flex: 1 }}>
                  <b>{share.isMine ? `${share.label} (you)` : share.label}</b>
                  <span className="gm" style={{ fontSize: 13 }}>
                    {METHOD[share.paymentMethod ?? 'CASH']}
                  </span>
                </div>
                <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
                  <b>{formatRupees(share.paidAmount ?? share.amount)}</b>
                  <QrStatusPill
                    status="ready"
                    label={`Paid · ${share.paymentMethod === 'UPI' ? 'UPI' : share.paymentMethod === 'CARD' ? 'Card' : 'Cash'}`}
                  />
                </div>
              </div>
            ))}
        </div>
      )}
      <div className="col" style={{ padding: '20px 16px', gap: 10 }}>
        <button type="button" className="gb o" onClick={downloadReceipt}>
          <Download size={20} aria-hidden /> Download receipt
        </button>
      </div>
      <p
        className="gm row"
        style={{ justifyContent: 'center', gap: 6, fontSize: 13, paddingBottom: 24 }}
      >
        <Clock size={14} aria-hidden /> You can close this page.
      </p>
    </div>
  );
}
