'use client';

import type { QrSessionResponse } from '@rms/api-contract';
import { Info } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { VegMark } from '@/components/QrStatus';
import { formatRupees } from '@/lib/qr';

import { DishTile, Stepper, TopBar } from './parts';

const AVATAR_COLORS = ['#B3401C', '#0B6B4D', '#7A2E8E', '#1F5FA8', '#8A5A00'];

/** Cart (G4); with more than one phone at the table it is the shared order (G7e). */
export default function CartView({
  session,
  tableNumber,
  captainName,
  onBack,
  onSetQuantity,
  onSend,
  sending,
  error,
}: {
  session: QrSessionResponse;
  tableNumber: string;
  captainName: string;
  onBack: () => void;
  onSetQuantity: (lineId: string, quantity: number) => void;
  onSend: (note: string) => void;
  sending: boolean;
  error: string | null;
}): ReactElement {
  const [note, setNote] = useState('');
  const { cart } = session;
  const shared = session.guests.length > 1;
  const roundNumber = session.rounds.length + 1;
  const blocked = cart.lines.some((line) => !line.available);

  return (
    <div>
      <TopBar
        title={shared ? `Shared order · Table ${tableNumber}` : `Your order · Table ${tableNumber}`}
        onBack={onBack}
      />
      <div style={{ padding: '4px 16px 0' }}>
        {shared ? (
          <div
            className="row"
            style={{
              gap: 12,
              marginTop: 12,
              padding: '12px 14px',
              borderRadius: 14,
              background: 'var(--bs)',
            }}
          >
            <div className="row" style={{ paddingLeft: 6 }} aria-hidden>
              {session.guests.slice(0, 4).map((guest, index) => (
                <div
                  key={guest.id}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: AVATAR_COLORS[index % AVATAR_COLORS.length],
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    border: '2px solid #FFF8EF',
                    marginLeft: -6,
                  }}
                >
                  {guest.isMe ? 'Y' : (guest.name[0] ?? '?').toUpperCase()}
                </div>
              ))}
            </div>
            <span style={{ fontSize: 14 }}>
              <b>{session.guests.length} phones</b> are adding to this order. Items show who added
              them.
            </span>
          </div>
        ) : (
          <div
            className="row"
            style={{
              gap: 8,
              margin: '12px 0 0',
              padding: '10px 12px',
              borderRadius: 12,
              background: 'var(--bs)',
            }}
          >
            <Info size={18} style={{ color: 'var(--brand)' }} aria-hidden />
            <span style={{ fontSize: 13 }}>
              <b>Round {roundNumber}</b> · goes to {captainName} first
            </span>
          </div>
        )}

        {cart.lines.length === 0 && (
          <p className="gm" style={{ padding: '28px 0', textAlign: 'center' }}>
            Nothing here yet. Add a few dishes from the menu.
          </p>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {cart.lines.map((line) => (
            <li
              key={line.id}
              className="row"
              style={{
                gap: 12,
                padding: '14px 0',
                borderBottom: '1px solid var(--gl)',
                alignItems: 'flex-start',
              }}
            >
              <DishTile name={line.name} size={52} radius={12} />
              <div className="col" style={{ flex: 1, gap: 3, minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <VegMark isVeg={line.isVeg} size={14} />
                  <b style={{ textDecoration: line.available ? undefined : 'line-through' }}>
                    {line.name}
                  </b>
                </div>
                {line.specialInstructions && (
                  <div className="gm" style={{ fontSize: 13 }}>
                    {line.specialInstructions}
                  </div>
                )}
                {!line.available && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--qs-rj-f)' }}>
                    Sold out today · remove to send
                  </div>
                )}
                {shared && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>
                    Added by {line.addedBy.isMe ? 'you' : line.addedBy.name}
                  </div>
                )}
              </div>
              <div className="col" style={{ alignItems: 'flex-end', gap: 8 }}>
                <b>{formatRupees(line.lineTotal)}</b>
                <Stepper
                  small
                  quantity={line.quantity}
                  label={line.name}
                  onChange={(next) => onSetQuantity(line.id, next)}
                />
              </div>
            </li>
          ))}
        </ul>

        {cart.lines.length > 0 && (
          <>
            <label className="col" style={{ gap: 8, margin: '16px 0 0' }}>
              <span className="gm" style={{ fontSize: 13, fontWeight: 700 }}>
                Note for the table
              </span>
              <textarea
                className="gfield"
                rows={2}
                maxLength={255}
                placeholder="Allergic to peanuts, please."
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <div className="gc" style={{ marginTop: 18, padding: '14px 16px' }}>
              <div className="col" style={{ gap: 8, padding: '6px 0' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="gm">Subtotal</span>
                  <span>{formatRupees(cart.totals.subtotal)}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="gm">CGST {Number(cart.totals.gstRate) / 2}%</span>
                  <span>{formatRupees(cart.totals.cgst, { paise: 'always' })}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="gm">SGST {Number(cart.totals.gstRate) / 2}%</span>
                  <span>{formatRupees(cart.totals.sgst, { paise: 'always' })}</span>
                </div>
                {Number(cart.totals.roundOff) !== 0 && (
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="gm">Round off</span>
                    <span>{signed(cart.totals.roundOff)}</span>
                  </div>
                )}
                <div
                  className="row"
                  style={{
                    justifyContent: 'space-between',
                    borderTop: '1px dashed #CBB9A6',
                    paddingTop: 10,
                    marginTop: 4,
                  }}
                >
                  <b style={{ fontSize: 17 }}>Total</b>
                  <b style={{ fontSize: 20 }}>{formatRupees(cart.totals.total)}</b>
                </div>
              </div>
            </div>
          </>
        )}
        <div style={{ height: 24 }} />
      </div>
      {cart.lines.length > 0 && (
        <div className="footer">
          {error && (
            <p
              role="alert"
              style={{ color: 'var(--qs-rj-f)', fontWeight: 600, marginBottom: 8, fontSize: 14 }}
            >
              {error}
            </p>
          )}
          <button
            type="button"
            className="gb"
            disabled={sending || blocked}
            onClick={() => onSend(note)}
          >
            {sending ? 'Sending…' : `Send order · ${formatRupees(cart.totals.total)}`}
          </button>
          <div className="gm" style={{ textAlign: 'center', fontSize: 13, marginTop: 10 }}>
            {shared
              ? `Anyone at the table can send. ${captainName} will confirm first.`
              : `${captainName} will confirm before it goes to the kitchen.`}
          </div>
        </div>
      )}
    </div>
  );
}

export function signed(value: string): string {
  const amount = Number(value);
  return `${amount >= 0 ? '+' : '−'}${formatRupees(Math.abs(amount), { paise: 'always' })}`;
}
