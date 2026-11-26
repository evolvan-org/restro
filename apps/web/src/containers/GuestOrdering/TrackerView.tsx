'use client';

import type { QrGuestRound, QrSessionResponse } from '@rms/api-contract';
import {
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Flame,
  Minus,
  Pencil,
  Phone,
  Plus,
  Receipt,
  X,
} from 'lucide-react';
import { type ReactElement, type ReactNode, useState } from 'react';

import { QrStatusPill, VegMark } from '@/components/QrStatus';
import { formatClockTime, formatRupees } from '@/lib/qr';

import { TopBar } from './parts';

type Step = { title: string; sub: string; state: 'done' | 'cur' | 'rej' | 'todo'; icon: ReactNode };

function durationText(fromIso: string | null, toIso: string | null): string {
  if (!fromIso || !toIso) return '';
  const seconds = Math.max(
    0,
    Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}

function stepsFor(round: QrGuestRound): Step[] {
  const captain = round.captainName ?? 'Your server';
  const check = <Check size={16} strokeWidth={3} aria-hidden />;
  const status = round.status;
  if (status === 'rejected') {
    return [
      { title: 'Waiting for server', sub: `Sent to ${captain}`, state: 'done', icon: check },
      {
        title: 'Not accepted',
        sub: `${captain} couldn’t send this order`,
        state: 'rej',
        icon: <X size={16} strokeWidth={3} aria-hidden />,
      },
      {
        title: 'Confirmed',
        sub: '',
        state: 'todo',
        icon: <Check size={16} strokeWidth={2.4} aria-hidden />,
      },
    ];
  }
  const order = ['awaiting', 'approved', 'preparing', 'ready', 'served'] as const;
  const stage = status === 'escalated' ? 0 : order.indexOf(status as (typeof order)[number]);
  const state = (index: number): Step['state'] =>
    index < stage ? 'done' : index === stage ? 'cur' : 'todo';
  const edited = round.edits.length > 0;
  const reassigned = round.previousCaptainName !== null && stage === 0;
  const confirmedIn = durationText(round.submittedAt, round.approvedAt);
  return [
    {
      title: 'Waiting for server',
      sub: reassigned
        ? `Passed to ${captain}`
        : stage > 0
          ? stage > 2
            ? confirmedIn
            : `Sent to ${captain}${confirmedIn ? ` · confirmed in ${confirmedIn}` : ''}`
          : `Sent to ${captain}`,
      state: stage > 0 ? 'done' : reassigned ? 'done' : 'cur',
      icon: stage > 0 || reassigned ? check : <CircleDot size={16} strokeWidth={2.4} aria-hidden />,
    },
    {
      title: reassigned
        ? `${captain} is confirming`
        : edited
          ? 'Confirmed with changes'
          : 'Confirmed',
      sub: reassigned
        ? `${captain} will send it shortly`
        : stage === 1
          ? `${captain} sent it to the kitchen and bar`
          : stage > 1
            ? edited
              ? `${captain} updated your order`
              : stage > 2
                ? captain
                : `${captain} sent it to the kitchen and bar`
            : '',
      state: reassigned ? 'cur' : state(1),
      icon: state(1) === 'done' ? check : <Check size={16} strokeWidth={2.4} aria-hidden />,
    },
    {
      title: 'Being prepared',
      sub:
        stage === 2
          ? 'The kitchen has your food'
          : stage > 2
            ? durationText(round.approvedAt, round.readyAt)
            : '',
      state: state(2),
      icon: state(2) === 'done' ? check : <Flame size={16} strokeWidth={2.4} aria-hidden />,
    },
    {
      title: 'On its way',
      sub:
        stage === 3
          ? `${captain} is bringing it over`
          : stage < 3 && stage >= 2
            ? 'We’ll tell you the moment it’s ready'
            : '',
      state: state(3),
      icon: state(3) === 'done' ? check : <Bell size={16} strokeWidth={2.4} aria-hidden />,
    },
    {
      title: 'Served',
      sub: stage === 4 && round.servedAt ? formatClockTime(round.servedAt) : '',
      state: state(4),
      icon: state(4) === 'done' ? check : <CircleDot size={16} strokeWidth={2.4} aria-hidden />,
    },
  ];
}

function hero(round: QrGuestRound, tableNumber: string): { title: string; sub: string } {
  const captain = round.captainName ?? 'Your server';
  switch (round.status) {
    case 'awaiting':
    case 'escalated':
      return round.previousCaptainName
        ? {
            title: `Waiting for ${captain} to confirm`,
            sub: `${round.previousCaptainName} handed Table ${tableNumber} to ${captain}.`,
          }
        : { title: `Waiting for ${captain} to confirm`, sub: `${captain} will confirm shortly.` };
    case 'approved':
      return round.edits.length
        ? { title: `Confirmed, with changes from ${captain}`, sub: 'We’ve updated your total.' }
        : { title: 'Confirmed. Sent to the kitchen', sub: `${captain} approved your order.` };
    case 'preparing':
      return round.edits.length
        ? { title: `Confirmed, with changes from ${captain}`, sub: 'We’ve updated your total.' }
        : {
            title: 'Your food is being prepared',
            sub: round.approvedAt
              ? `${captain} confirmed your order at ${formatClockTime(round.approvedAt)}.`
              : 'The kitchen has started on it.',
          };
    case 'ready':
      return {
        title: 'Your food is on its way',
        sub: `The chef just marked it ready. ${captain} is bringing it to Table ${tableNumber}.`,
      };
    case 'served':
      return {
        title: 'Enjoy your meal',
        sub: 'Add more items any time, or ask for the bill when you’re ready.',
      };
    case 'rejected':
      return {
        title: `${captain} couldn’t send this order`,
        sub: 'You can change it and send again.',
      };
  }
}

/** Order tracker (G5a–G5e): per-round live timeline; the hero screen of the guest app. */
export default function TrackerView({
  session,
  tableNumber,
  offline,
  onBack,
  onCallServer,
  calling,
  onAddMore,
  onEditRejected,
  restoring,
  onRequestBill,
  requestingBill,
  onOpenCart,
}: {
  session: QrSessionResponse;
  tableNumber: string;
  offline: boolean;
  onBack: () => void;
  onCallServer: () => void;
  calling: boolean;
  onAddMore: () => void;
  onEditRejected: (roundId: string) => void;
  restoring: boolean;
  onRequestBill: () => void;
  requestingBill: boolean;
  onOpenCart: () => void;
}): ReactElement {
  const rounds = [...session.rounds].reverse();
  const [current, ...earlier] = rounds;
  const [expanded, setExpanded] = useState(false);
  if (!current) {
    return (
      <div>
        <TopBar title="Your order" onBack={onBack} />
        <p className="gm" style={{ padding: 24, textAlign: 'center' }}>
          You haven’t sent an order yet.
        </p>
      </div>
    );
  }
  const view = hero(current, tableNumber);
  const steps = stepsFor(current);
  const captain = current.captainName ?? 'your server';
  const pendingCart = session.cart.itemCount;
  const anyApproved = session.rounds.some(
    (round) =>
      round.status !== 'rejected' && round.status !== 'awaiting' && round.status !== 'escalated',
  );

  return (
    <div style={{ paddingBottom: 24 }}>
      <TopBar
        title="Your order"
        onBack={onBack}
        right={
          current.previousCaptainName ? null : (
            <span className="badge" style={{ height: 28, marginRight: 8, color: 'var(--mg)' }}>
              Round {current.number}
            </span>
          )
        }
      />

      {current.previousCaptainName &&
        (current.status === 'awaiting' || current.status === 'escalated') && (
          <div
            className="qr-slidein row"
            style={{
              gap: 12,
              margin: '14px 16px 0',
              padding: '14px 16px',
              borderRadius: 16,
              background: 'var(--bs)',
              boxShadow: 'inset 0 0 0 1.5px var(--brand)',
            }}
            role="status"
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'var(--brand)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                flex: 'none',
              }}
              aria-hidden
            >
              {(current.captainName ?? '?')[0]}
            </div>
            <div className="col">
              <b>{current.captainName} is now looking after your table</b>
              <span className="gm" style={{ fontSize: 13 }}>
                Your order is safe. Nothing for you to do.
              </span>
            </div>
          </div>
        )}

      <div
        className="gc"
        style={{ padding: 18, margin: '14px 16px 0', opacity: offline ? 0.6 : 1 }}
        aria-live="polite"
      >
        <div style={{ display: 'inline-block' }}>
          <QrStatusPill
            status={current.status === 'escalated' ? 'awaiting' : current.status}
            large
          />
        </div>
        <h2 className="fr" style={{ fontSize: 26, marginTop: 10, lineHeight: 1.15 }}>
          {view.title}
        </h2>
        <p className="gm" style={{ marginTop: 6 }}>
          {offline ? 'Showing the last update we received.' : view.sub}
        </p>
      </div>

      {current.status === 'rejected' && current.rejectReason && (
        <div
          className="gc"
          style={{ margin: '14px 16px 0', padding: 16, borderColor: 'var(--qs-rj)' }}
        >
          <div className="row" style={{ gap: 10 }}>
            <QrStatusPill status="rejected" />
            <b>Message from {captain}</b>
          </div>
          <p style={{ marginTop: 8, fontSize: 17, lineHeight: 1.4 }}>“{current.rejectReason}”</p>
          <p className="gm" style={{ marginTop: 8, fontSize: 13 }}>
            Nothing was sent to the kitchen and you haven’t been charged.
          </p>
        </div>
      )}

      {current.edits.length > 0 && current.status !== 'rejected' && (
        <div
          className="gc"
          style={{ margin: '14px 16px 0', padding: 16, borderColor: 'var(--qs-ap)' }}
        >
          <div className="row" style={{ gap: 10 }}>
            <Pencil size={18} style={{ color: 'var(--qs-ap)' }} aria-hidden />
            <b>
              {captain} made {current.edits.length}{' '}
              {current.edits.length === 1 ? 'change' : 'changes'}
            </b>
          </div>
          {current.edits.map((edit) => (
            <div key={edit.name} className="row" style={{ gap: 10, marginTop: 10 }}>
              {edit.to === 0 ? (
                <>
                  <Minus size={16} style={{ color: 'var(--qs-rj)' }} aria-hidden />
                  <span className="gm" style={{ textDecoration: 'line-through' }}>
                    {edit.name} × {edit.from}
                  </span>
                  <span className="badge" style={{ marginLeft: 'auto' }}>
                    {edit.outOfStock ? 'Out of stock' : 'Removed'}
                  </span>
                </>
              ) : (
                <>
                  {edit.to > edit.from ? (
                    <Plus size={16} style={{ color: 'var(--qs-rd)' }} aria-hidden />
                  ) : (
                    <Check size={16} style={{ color: 'var(--qs-rd)' }} aria-hidden />
                  )}
                  <span>
                    {edit.name} × {edit.from} → <b>× {edit.to}</b>
                  </span>
                </>
              )}
            </div>
          ))}
          <p className="gm" style={{ marginTop: 10, fontSize: 13 }}>
            {current.editNote && `“${current.editNote}” `}Total is now{' '}
            <b style={{ color: '#2B1A12' }}>{formatRupees(current.totals.total)}</b>.
          </p>
        </div>
      )}

      <div style={{ padding: '22px 16px 6px 34px', opacity: offline ? 0.6 : 1 }}>
        <ol
          className="tl"
          style={{ listStyle: 'none', margin: 0 }}
          aria-label={`Round ${current.number} progress`}
        >
          {steps.map((step) => (
            <li
              key={step.title}
              className={`st1 ${step.state === 'todo' ? '' : step.state}`}
              aria-current={step.state === 'cur' ? 'step' : undefined}
            >
              <div className={`nd${step.state === 'cur' ? ' qr-pulse' : ''}`}>{step.icon}</div>
              <b style={step.state === 'todo' ? { color: 'var(--mg)' } : undefined}>{step.title}</b>
              <span className="sr-only">
                {step.state === 'done'
                  ? ' (done)'
                  : step.state === 'cur'
                    ? ' (now)'
                    : step.state === 'rej'
                      ? ' (not accepted)'
                      : ''}
              </span>
              <div className="gm" style={{ fontSize: 13, marginTop: 2 }}>
                {step.sub}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {current.status !== 'rejected' && (
        <div className="gc" style={{ margin: '0 16px', padding: '4px 16px' }}>
          <button
            type="button"
            className="row"
            style={{ justifyContent: 'space-between', minHeight: 48, width: '100%' }}
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            <b>
              {current.itemCount} {current.itemCount === 1 ? 'item' : 'items'} ·{' '}
              {formatRupees(current.totals.total)}
            </b>
            <span className="gm">
              {expanded ? (
                <ChevronUp size={20} aria-hidden />
              ) : (
                <ChevronDown size={20} aria-hidden />
              )}
            </span>
          </button>
          {expanded && (
            <ul style={{ listStyle: 'none', margin: 0, padding: '0 0 10px' }}>
              {current.items.map((item) => (
                <li key={item.id} className="row" style={{ gap: 8, padding: '6px 0' }}>
                  <VegMark isVeg={item.isVeg} size={14} />
                  <span
                    style={{
                      flex: 1,
                      textDecoration: item.status === 'ACTIVE' ? undefined : 'line-through',
                    }}
                  >
                    <span className="gm">
                      {item.status === 'ACTIVE' ? item.quantity : item.requestedQuantity} ×
                    </span>{' '}
                    {item.name}
                  </span>
                  <span className="gm" style={{ fontSize: 12 }}>
                    {item.addedBy}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ height: 14 }} />
      {current.status === 'rejected' ? (
        <div className="col" style={{ gap: 10, padding: '6px 16px 0' }}>
          <button
            type="button"
            className="gb"
            disabled={restoring}
            onClick={() => onEditRejected(current.id)}
          >
            {restoring ? 'One moment…' : 'Edit order and send again'}
          </button>
          <button type="button" className="gb o" disabled={calling} onClick={onCallServer}>
            <Phone size={20} aria-hidden /> Call server
          </button>
        </div>
      ) : (
        <div className="col" style={{ gap: 10, padding: '0 16px' }}>
          <div className="row" style={{ gap: 10 }}>
            <button
              type="button"
              className="gb o s"
              style={{ flex: 1 }}
              disabled={calling}
              onClick={onCallServer}
            >
              <Phone size={18} aria-hidden />{' '}
              {current.previousCaptainName ? `Call ${current.captainName}` : 'Call server'}
            </button>
            {!current.previousCaptainName && (
              <button type="button" className="gb s" style={{ flex: 1 }} onClick={onAddMore}>
                <Plus size={18} strokeWidth={2.6} aria-hidden /> Add more items
              </button>
            )}
          </div>
          {anyApproved && (
            <button
              type="button"
              className="gb o s"
              disabled={requestingBill}
              onClick={onRequestBill}
            >
              <Receipt size={18} aria-hidden />{' '}
              {session.billRequestedAt ? 'View bill' : 'Request bill'}
            </button>
          )}
        </div>
      )}

      {pendingCart > 0 && (
        <button
          type="button"
          className="gc"
          style={{
            margin: '16px 16px 0',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: 'calc(100% - 32px)',
          }}
          onClick={onOpenCart}
        >
          <span className="badge" style={{ height: 28, color: 'var(--mg)' }}>
            Round {session.rounds.length + 1}
          </span>
          <span className="gm" style={{ flex: 1, textAlign: 'left' }}>
            Not sent yet
          </span>
          <span style={{ color: 'var(--brand)', fontWeight: 700 }}>Continue</span>
        </button>
      )}

      {earlier.length > 0 && (
        <div style={{ padding: '18px 16px 0' }}>
          <h3
            className="gm"
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Earlier rounds
          </h3>
          {earlier.map((round) => (
            <div
              key={round.id}
              className="row"
              style={{ gap: 10, padding: '10px 0', borderBottom: '1px solid var(--gl)' }}
            >
              <span className="badge" style={{ height: 26 }}>
                Round {round.number}
              </span>
              <span style={{ flex: 1 }}>
                {round.itemCount} {round.itemCount === 1 ? 'item' : 'items'} ·{' '}
                {formatRupees(round.totals.total)}
              </span>
              <QrStatusPill status={round.status === 'escalated' ? 'awaiting' : round.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
