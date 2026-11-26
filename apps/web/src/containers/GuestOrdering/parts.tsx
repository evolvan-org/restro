'use client';

import { ArrowLeft, Minus, Phone, Plus } from 'lucide-react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

export type Brand = {
  name: string;
  initials: string;
  brandColor: string;
  guestPhone: string | null;
};

/** Round logo mark + restaurant name + a sub line ("Table 7 · Your server: Arjun"). */
export function BrandHeader({ brand, sub }: { brand: Brand; sub: ReactNode }): ReactElement {
  return (
    <div className="row" style={{ gap: 12, padding: '16px 16px 12px' }}>
      <div
        className="fr"
        aria-hidden
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'var(--brand)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
        }}
      >
        {brand.initials}
      </div>
      <div className="col" style={{ minWidth: 0 }}>
        <h1 className="fr" style={{ fontSize: 20, lineHeight: 1.1 }}>
          {brand.name}
        </h1>
        <div className="gm" style={{ fontSize: 13, marginTop: 3 }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

export function TopBar({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}): ReactElement {
  return (
    <div className="row tophdr">
      {onBack ? (
        <button type="button" className="iconbtn" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={24} strokeWidth={2} aria-hidden />
        </button>
      ) : (
        <span style={{ width: 12 }} />
      )}
      <h1 className="fr" style={{ fontSize: 19, flex: 1 }}>
        {title}
      </h1>
      {right}
    </div>
  );
}

/** Drawn placeholder tile (no menu photos yet): a warm plate whose hue comes from the dish name. */
export function DishTile({
  name,
  size,
  radius = 16,
}: {
  name: string;
  size: number;
  radius?: number;
}): ReactElement {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  const hue = (hash % 60) + 8;
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    background: `radial-gradient(circle at 50% 50%, hsl(${hue} 72% 42%) 0 20%, hsl(${hue + 8} 66% 56%) 21% 33%, #fffaf2 34% 41%, hsl(${hue} 40% 86%) 42%)`,
  };
  return <div className="photo" aria-hidden style={style} />;
}

export function Stepper({
  quantity,
  onChange,
  label,
  small,
  outline,
  max = 20,
  disabled,
}: {
  quantity: number;
  onChange: (next: number) => void;
  label: string;
  small?: boolean;
  outline?: boolean;
  max?: number;
  disabled?: boolean;
}): ReactElement {
  return (
    <div
      className={`stp${small ? ' sm' : ''}`}
      style={
        outline
          ? {
              background: '#fff',
              color: 'var(--brand)',
              boxShadow: 'inset 0 0 0 1.5px var(--brand)',
            }
          : undefined
      }
    >
      <button
        type="button"
        aria-label={`Remove one ${label}`}
        disabled={disabled}
        onClick={() => onChange(quantity - 1)}
      >
        <Minus size={16} strokeWidth={2.6} aria-hidden />
      </button>
      <span aria-live="polite" style={outline ? { color: '#2B1A12' } : undefined}>
        {quantity}
      </span>
      <button
        type="button"
        aria-label={`Add one ${label}`}
        disabled={disabled || quantity >= max}
        onClick={() => onChange(quantity + 1)}
      >
        <Plus size={16} strokeWidth={2.6} aria-hidden />
      </button>
    </div>
  );
}

/** "Call restaurant · +91 80 4123 4567" as a real tel: link. */
export function CallRestaurant({
  phone,
  outline,
}: {
  phone: string | null;
  outline?: boolean;
}): ReactElement | null {
  if (!phone) return null;
  return (
    <a className={`gb${outline ? ' o' : ''}`} href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
      <Phone size={20} strokeWidth={2} aria-hidden /> Call restaurant · {phone}
    </a>
  );
}

export function Circle({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        width: 104,
        height: 104,
        borderRadius: '50%',
        background: 'var(--bs)',
        color: 'var(--brand)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-hidden
    >
      {children}
    </div>
  );
}
