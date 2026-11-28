'use client';

import type {
  QrGuestRound,
  QrMenuItem,
  QrMenuResponse,
  QrSessionResponse,
} from '@rms/api-contract';
import { ChevronRight, Lock, Phone, Plus, RefreshCw, Search } from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';

import { QrStatusPill, VegMark } from '@/components/QrStatus';
import { formatRupees } from '@/lib/qr';

import GuestFeedback from './GuestFeedback';
import { type Brand, BrandHeader, DishTile, Stepper } from './parts';

/**
 * Menu (G1). In `blocked` mode it is the no-captain screen (G2): the friendly block on top and the
 * menu below, view only. Steppers change this phone's plain line for a dish; tapping a dish opens the
 * detail sheet for special instructions.
 */
export default function MenuView({
  brand,
  tableNumber,
  token,
  captainName,
  menu,
  session,
  mode,
  onOpenItem,
  onQuickAdd,
  onSetQuantity,
  onViewOrder,
  onTryAgain,
  tryingAgain,
  stillBlocked,
  banner,
  onTrackOrder,
}: {
  brand: Brand;
  tableNumber: string;
  token: string;
  captainName: string | null;
  menu: QrMenuResponse;
  session: QrSessionResponse | null;
  mode: 'order' | 'blocked' | 'view';
  onOpenItem: (item: QrMenuItem) => void;
  onQuickAdd: (item: QrMenuItem) => void;
  onSetQuantity: (lineId: string, quantity: number) => void;
  onViewOrder: () => void;
  onTryAgain?: () => void;
  tryingAgain?: boolean;
  stillBlocked?: boolean;
  banner?: ReactElement | null;
  /** Opens the tracker; shown as the "Your order" strip once a round has been sent. */
  onTrackOrder?: () => void;
}): ReactElement {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(menu.categories[0]?.id ?? '');
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const canOrder = mode === 'order';

  const categories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return menu.categories;
    return menu.categories
      .map((category) => ({
        ...category,
        items: category.items.filter(
          (item) =>
            item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q),
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [menu, query]);

  // Highlight the tab of the section in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        const first = visible.sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
        )[0];
        if (first) setActive(first.target.getAttribute('data-category') ?? '');
      },
      { rootMargin: '-120px 0px -60% 0px' },
    );
    sectionRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [categories]);

  /** This phone's plain (no instructions) cart line per dish, for the inline stepper. */
  const myLines = useMemo(() => {
    const lines = new Map<string, { id: string; quantity: number }>();
    for (const line of session?.cart.lines ?? []) {
      if (line.addedBy.isMe && !line.specialInstructions) {
        lines.set(line.menuItemId, { id: line.id, quantity: line.quantity });
      }
    }
    return lines;
  }, [session]);

  const scrollTo = (id: string): void => {
    setActive(id);
    sectionRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cartCount = session?.cart.itemCount ?? 0;

  return (
    <div style={{ paddingBottom: canOrder && cartCount > 0 ? 96 : 24 }}>
      {banner}
      <BrandHeader
        brand={brand}
        sub={
          mode === 'order' && captainName ? (
            <>
              Table {tableNumber} · Your server: <b style={{ color: '#2B1A12' }}>{captainName}</b>
            </>
          ) : (
            `Table ${tableNumber} · Welcome`
          )
        }
      />

      <div className="px-4">
        <GuestFeedback token={token} />
      </div>

      {mode === 'order' && onTrackOrder && session && session.rounds.length > 0 && (
        <OrderStrip
          round={session.rounds[session.rounds.length - 1] as QrGuestRound}
          rounds={session.rounds.length}
          billRequested={session.billRequestedAt !== null}
          onClick={onTrackOrder}
        />
      )}

      {mode === 'blocked' && (
        <>
          <div
            className="col"
            style={{ alignItems: 'center', textAlign: 'center', padding: '14px 24px 0', gap: 14 }}
          >
            <div
              aria-hidden
              style={{
                width: 112,
                height: 112,
                borderRadius: '50%',
                background: 'var(--bs)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--brand)',
              }}
            >
              <svg
                width="64"
                height="64"
                viewBox="0 0 64 64"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 28h44M16 28v22M48 28v22M24 28c0-8 4-14 8-14s8 6 8 14" />
                <path d="M28 14h8" />
                <path d="M44 8l3 3M52 14l-3 1M20 8l-3 3" />
              </svg>
            </div>
            <h2 className="fr" style={{ fontSize: 25, lineHeight: 1.15 }}>
              Ordering isn’t available at this table right now
            </h2>
            <p className="gm" style={{ fontSize: 16, lineHeight: 1.5 }}>
              Please contact the restaurant staff or ask to be seated at another table.
            </p>
          </div>
          <div className="col" style={{ padding: '22px 20px 0', gap: 10 }}>
            {brand.guestPhone && (
              <a className="gb" href={`tel:${brand.guestPhone.replace(/[^\d+]/g, '')}`}>
                <Phone size={20} strokeWidth={2} aria-hidden /> Call restaurant · {brand.guestPhone}
              </a>
            )}
            <button type="button" className="gb o" onClick={onTryAgain} disabled={tryingAgain}>
              <RefreshCw size={20} strokeWidth={2} aria-hidden />{' '}
              {tryingAgain ? 'Checking…' : 'Try again'}
            </button>
            <div
              className="gm"
              role="status"
              aria-live="polite"
              style={{ textAlign: 'center', fontSize: 13 }}
            >
              {stillBlocked
                ? 'Still no server for this table. Staff have been told.'
                : 'Staff have been told you’re here. Tap Try again once someone has helped.'}
            </div>
          </div>
          <div
            className="row"
            style={{
              gap: 8,
              padding: '22px 16px 0',
              fontWeight: 700,
              color: 'var(--mg)',
              fontSize: 13,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
            }}
          >
            <Lock size={16} aria-hidden /> Menu · view only
          </div>
        </>
      )}

      {mode !== 'blocked' && (
        <div style={{ padding: '0 16px 12px' }}>
          <label className="gin">
            <Search size={18} aria-hidden />
            <span className="sr-only">Search dishes</span>
            <input
              type="search"
              placeholder="Search dishes"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      )}

      {mode !== 'blocked' && categories.length > 0 && (
        <div className="tabs" role="tablist" aria-label="Menu sections">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={active === category.id}
              className="gtab"
              onClick={() => scrollTo(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '4px 16px 0', opacity: mode === 'blocked' ? 0.85 : 1 }}>
        {categories.length === 0 && (
          <p className="gm" style={{ padding: '24px 0', textAlign: 'center' }}>
            {query ? `Nothing matches “${query}”.` : 'The menu is empty right now.'}
          </p>
        )}
        {categories.map((category) => (
          <section
            key={category.id}
            data-category={category.id}
            ref={(element) => {
              if (element) sectionRefs.current.set(category.id, element);
              else sectionRefs.current.delete(category.id);
            }}
            style={{ scrollMarginTop: 72 }}
            aria-label={category.name}
          >
            {mode !== 'blocked' && (
              <h2 className="fr" style={{ fontSize: 22, marginTop: 14 }}>
                {category.name}
              </h2>
            )}
            {category.items.map((item) => {
              const line = myLines.get(item.id);
              const dim = !item.available || mode === 'blocked';
              return (
                <div
                  key={item.id}
                  className="row"
                  style={{
                    gap: 14,
                    alignItems: 'flex-start',
                    padding: '16px 0',
                    borderBottom: '1px solid var(--gl)',
                  }}
                >
                  <button
                    type="button"
                    className="col"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      gap: 5,
                      textAlign: 'left',
                      opacity: dim ? 0.55 : 1,
                    }}
                    onClick={() => canOrder && item.available && onOpenItem(item)}
                    disabled={!canOrder || !item.available}
                    aria-label={`${item.name}, ${formatRupees(item.price)}${item.isVeg === null ? '' : item.isVeg ? ', vegetarian' : ', non-vegetarian'}${item.available ? '' : ', sold out today'}`}
                  >
                    <span className="row" style={{ gap: 7 }}>
                      <VegMark isVeg={item.isVeg} />
                      <b style={{ fontSize: 16 }}>{item.name}</b>
                    </span>
                    <span style={{ fontWeight: 700 }}>{formatRupees(item.price)}</span>
                    {item.description && (
                      <span className="gm" style={{ fontSize: 13 }}>
                        {item.description}
                      </span>
                    )}
                  </button>
                  <div className="col" style={{ alignItems: 'center', gap: 10 }}>
                    <div style={{ opacity: dim ? 0.55 : 1 }}>
                      <DishTile name={item.name} size={96} />
                    </div>
                    {mode === 'blocked' ? (
                      <div className="add dis" style={{ minWidth: 116 }}>
                        Ordering off
                      </div>
                    ) : !item.available ? (
                      <div className="add dis" style={{ minWidth: 116 }}>
                        Sold out today
                      </div>
                    ) : mode === 'view' ? null : line ? (
                      <Stepper
                        quantity={line.quantity}
                        label={item.name}
                        onChange={(next) => onSetQuantity(line.id, next)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="add"
                        onClick={() => onQuickAdd(item)}
                        aria-label={`Add ${item.name}`}
                      >
                        <Plus size={16} strokeWidth={2.6} aria-hidden /> Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {canOrder && cartCount > 0 && (
        <button type="button" className="cbar" onClick={onViewOrder}>
          <span className="row" style={{ gap: 10 }}>
            <span
              style={{
                background: '#fff',
                color: 'var(--brand)',
                borderRadius: 12,
                minWidth: 30,
                height: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
              }}
            >
              {cartCount}
            </span>
            <span>View order</span>
          </span>
          <span style={{ fontSize: 17 }}>{formatRupees(session?.cart.totals.subtotal ?? '0')}</span>
        </button>
      )}
    </div>
  );
}

const STRIP_TEXT: Record<QrGuestRound['status'], (captain: string) => string> = {
  awaiting: (captain) => `Waiting for ${captain} to confirm`,
  escalated: (captain) => `Waiting for ${captain} to confirm`,
  approved: () => 'Sent to the kitchen',
  preparing: () => 'Being prepared',
  ready: () => 'Your food is on its way',
  served: () => 'Served',
  rejected: (captain) => `${captain} couldn’t send this order`,
};

/** Way back to the tracker from the menu: the latest round's live status. */
function OrderStrip({
  round,
  rounds,
  billRequested,
  onClick,
}: {
  round: QrGuestRound;
  rounds: number;
  billRequested: boolean;
  onClick: () => void;
}): ReactElement {
  const captain = round.captainName ?? 'your server';
  return (
    <div style={{ padding: '0 16px 12px' }}>
      <button
        type="button"
        className="gc row"
        onClick={onClick}
        aria-label={`Your order, round ${round.number}: ${STRIP_TEXT[round.status](captain)}. Open order status`}
        style={{ width: '100%', gap: 12, minHeight: 60, padding: '10px 14px', textAlign: 'left' }}
      >
        <QrStatusPill status={round.status === 'escalated' ? 'awaiting' : round.status} />
        <span className="col" style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 15 }}>Your order{rounds > 1 ? ` · Round ${round.number}` : ''}</b>
          <span
            className="gm"
            style={{
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {billRequested ? 'Bill requested' : STRIP_TEXT[round.status](captain)}
          </span>
        </span>
        <ChevronRight size={20} style={{ color: 'var(--brand)', flex: 'none' }} aria-hidden />
      </button>
    </div>
  );
}
