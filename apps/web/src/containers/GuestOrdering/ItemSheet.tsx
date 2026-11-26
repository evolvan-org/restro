'use client';

import type { QrMenuItem } from '@rms/api-contract';
import { X } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';

import { VegMark } from '@/components/QrStatus';
import { formatRupees } from '@/lib/qr';

import { DishTile, Stepper } from './parts';

/** Item detail sheet (G3): description, special instructions, quantity, "Add to order · ₹X". */
export default function ItemSheet({
  item,
  onClose,
  onAdd,
  adding,
}: {
  item: QrMenuItem;
  onClose: () => void;
  onAdd: (quantity: number, instructions: string) => void;
  adding: boolean;
}): ReactElement {
  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="item-sheet-title">
        <div
          style={{
            height: 200,
            position: 'relative',
            background: 'linear-gradient(135deg,#F3D3A8,#E9B27A)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '26px 26px 0 0',
          }}
        >
          <DishTile name={item.name} size={150} radius={75} />
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              position: 'absolute',
              right: 12,
              top: 12,
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={22} aria-hidden />
          </button>
        </div>
        <div className="col" style={{ padding: '18px 20px 0', gap: 6 }}>
          {item.isVeg !== null && (
            <div className="row" style={{ gap: 8 }}>
              <VegMark isVeg={item.isVeg} />
              <span className="gm" style={{ fontSize: 13, fontWeight: 700 }}>
                {item.isVeg ? 'Veg' : 'Non-veg'}
              </span>
            </div>
          )}
          <div
            className="row"
            style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}
          >
            <h2 id="item-sheet-title" className="fr" style={{ fontSize: 25 }}>
              {item.name}
            </h2>
            <b style={{ fontSize: 20 }}>{formatRupees(item.price)}</b>
          </div>
          {item.description && <p className="gm">{item.description}</p>}
        </div>
        <div style={{ padding: '16px 20px 0' }}>
          <label className="col b7" style={{ gap: 8 }}>
            Special instructions
            <textarea
              className="gfield"
              rows={2}
              maxLength={255}
              placeholder="Less oil, no coriander…"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              style={{ fontWeight: 400 }}
            />
          </label>
        </div>
        <div className="row" style={{ gap: 12, padding: '16px 20px 20px' }}>
          <Stepper
            outline
            quantity={quantity}
            label={item.name}
            onChange={(next) => setQuantity(Math.max(1, next))}
          />
          <button
            type="button"
            className="gb"
            style={{ flex: 1, justifyContent: 'space-between', padding: '0 20px' }}
            disabled={adding}
            onClick={() => onAdd(quantity, instructions)}
          >
            <span>{adding ? 'Adding…' : 'Add to order'}</span>
            <span>{formatRupees(Number(item.price) * quantity)}</span>
          </button>
        </div>
      </div>
    </>
  );
}
