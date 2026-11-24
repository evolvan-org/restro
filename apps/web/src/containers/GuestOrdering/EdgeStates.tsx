'use client';

import { QrCode, RefreshCw, Store, Unplug, WifiOff } from 'lucide-react';
import type { ReactElement } from 'react';

import { type Brand, BrandHeader, CallRestaurant, Circle } from './parts';

/** G7a: unknown, damaged or rotated QR. Never reveals which restaurant (if any) it belonged to. */
export function InvalidQr(): ReactElement {
  return (
    <div>
      <div style={{ height: 20 }} />
      <div
        className="col"
        style={{ alignItems: 'center', textAlign: 'center', padding: '60px 28px 0', gap: 14 }}
      >
        <Circle>
          <QrCode size={52} strokeWidth={2} />
        </Circle>
        <h1 className="fr" style={{ fontSize: 26, lineHeight: 1.15 }}>
          This QR code isn’t working
        </h1>
        <p className="gm" style={{ fontSize: 16, lineHeight: 1.5 }}>
          It may be damaged or out of date. Ask a member of staff to help you order.
        </p>
      </div>
    </div>
  );
}

/** G7b: QR ordering is switched off (or the restaurant is not active). */
export function RestaurantClosed({
  brand,
  onViewMenu,
}: {
  brand: Brand;
  onViewMenu: () => void;
}): ReactElement {
  return (
    <div>
      <BrandHeader brand={brand} sub="Welcome" />
      <div
        className="col"
        style={{ alignItems: 'center', textAlign: 'center', padding: '60px 28px 0', gap: 14 }}
      >
        <Circle>
          <Store size={52} strokeWidth={2} />
        </Circle>
        <h1 className="fr" style={{ fontSize: 26, lineHeight: 1.15 }}>
          We’re closed right now
        </h1>
        <p className="gm" style={{ fontSize: 16, lineHeight: 1.5 }}>
          {brand.name} isn’t taking orders from the table at the moment. You can still look through
          the menu.
        </p>
        <button type="button" className="gb" style={{ marginTop: 6 }} onClick={onViewMenu}>
          View menu
        </button>
      </div>
    </div>
  );
}

/** G7c: the table exists but is switched off. */
export function TableInactive({ brand }: { brand: Brand }): ReactElement {
  return (
    <div>
      <BrandHeader brand={brand} sub="Welcome" />
      <div
        className="col"
        style={{ alignItems: 'center', textAlign: 'center', padding: '60px 28px 0', gap: 14 }}
      >
        <Circle>
          <Unplug size={52} strokeWidth={2} />
        </Circle>
        <h1 className="fr" style={{ fontSize: 26, lineHeight: 1.15 }}>
          This table isn’t in use
        </h1>
        <p className="gm" style={{ fontSize: 16, lineHeight: 1.5 }}>
          Please ask the host to seat you at another table, then scan the code there.
        </p>
        <div style={{ marginTop: 6, width: '100%' }}>
          <CallRestaurant phone={brand.guestPhone} />
        </div>
      </div>
    </div>
  );
}

/** G7d: dark banner while the connection is down; the screen keeps the last state it received. */
export function OfflineBanner({ onRetry }: { onRetry: () => void }): ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className="row"
      style={{
        gap: 10,
        padding: '12px 16px',
        background: '#2B1A12',
        color: '#fff',
        fontWeight: 600,
        position: 'sticky',
        top: 0,
        zIndex: 25,
      }}
    >
      <WifiOff size={18} aria-hidden /> Connection lost · reconnecting…
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginLeft: 'auto',
          color: '#FCD34D',
          fontSize: 13,
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <RefreshCw size={14} aria-hidden /> Retry
      </button>
    </div>
  );
}

/** G7f: loading skeleton for the menu. */
export function MenuSkeleton(): ReactElement {
  return (
    <div aria-busy="true" aria-label="Loading the menu">
      <div className="row" style={{ gap: 12, padding: 16 }}>
        <div className="sk" style={{ width: 40, height: 40, borderRadius: 20 }} />
        <div className="col" style={{ gap: 8 }}>
          <div className="sk" style={{ width: 150, height: 18 }} />
          <div className="sk" style={{ width: 190, height: 12 }} />
        </div>
      </div>
      <div style={{ padding: '0 16px 12px' }}>
        <div className="sk" style={{ width: '100%', height: 48, borderRadius: 14 }} />
      </div>
      <div className="row" style={{ gap: 8, padding: '10px 16px' }}>
        {[0, 1, 2].map((key) => (
          <div key={key} className="sk" style={{ width: 88, height: 44, borderRadius: 22 }} />
        ))}
      </div>
      <div style={{ padding: '0 16px' }}>
        {[0, 1, 2, 3].map((key) => (
          <div
            key={key}
            className="row"
            style={{ gap: 14, padding: '16px 0', borderBottom: '1px solid var(--gl)' }}
          >
            <div className="col" style={{ flex: 1, gap: 10 }}>
              <div className="sk" style={{ width: '60%', height: 18 }} />
              <div className="sk" style={{ width: '90%', height: 12 }} />
              <div className="sk" style={{ width: '30%', height: 14 }} />
            </div>
            <div className="sk" style={{ width: 96, height: 96, borderRadius: 16 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
