'use client';

import type { QrDisplayStatus } from '@rms/api-contract';
import { cn } from 'cn';
import { Bell, Check, CheckCheck, Clock, Flame, TriangleAlert, X } from 'lucide-react';
import type { ReactElement } from 'react';

import { STATUS_LABEL, STATUS_TOKEN, type TimerTone } from '@/lib/qr';

const ICONS = {
  awaiting: Clock,
  escalated: TriangleAlert,
  approved: Check,
  preparing: Flame,
  ready: Bell,
  served: CheckCheck,
  rejected: X,
} as const;

/** Status pill (CP1): fixed hue + icon + text, so meaning never depends on colour. */
export function QrStatusPill({
  status,
  label,
  large,
  className,
}: {
  status: QrDisplayStatus;
  label?: string;
  large?: boolean;
  className?: string;
}): ReactElement {
  const Icon = ICONS[status];
  const token = STATUS_TOKEN[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold whitespace-nowrap',
        large ? 'h-[30px] gap-[7px] pr-[13px] pl-2.5 text-sm' : 'h-6 gap-[5px] pr-2.5 pl-2 text-xs',
        className,
      )}
      style={{
        background: `var(--qs-${token}-b)`,
        color: `var(--qs-${token}-f)`,
        boxShadow: status === 'rejected' ? 'inset 0 0 0 1px var(--qs-rj)' : undefined,
      }}
    >
      <Icon className={large ? 'size-4' : 'size-3.5'} strokeWidth={2.4} aria-hidden />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

const TIMER_STYLE: Record<TimerTone, React.CSSProperties> = {
  neutral: { background: 'var(--muted)', color: 'var(--foreground)' },
  amber: {
    background: 'var(--qs-aw-b)',
    color: 'var(--qs-aw-f)',
    boxShadow: 'inset 0 0 0 1.5px var(--qs-aw)',
  },
  red: { background: 'var(--qs-es-b)', color: '#fff' },
};

/** Escalation timer chip (CP1): neutral → amber at ⅔ of the limit → red once escalated. */
export function QrTimer({
  tone,
  text,
  label,
}: {
  tone: TimerTone;
  text: string;
  label?: string;
}): ReactElement {
  const Icon = tone === 'red' ? TriangleAlert : Clock;
  return (
    <span
      className="inline-flex h-[26px] items-center gap-[5px] rounded-[7px] px-[9px] text-[13px] leading-none font-bold whitespace-nowrap tabular-nums"
      style={TIMER_STYLE[tone]}
      aria-label={label ?? `Waiting ${text}`}
    >
      <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />
      {text}
    </span>
  );
}

/** Kitchen / Bar routing tag on review lines. */
export function DestinationTag({
  destination,
  children,
}: {
  destination: 'KITCHEN' | 'BAR';
  children?: React.ReactNode;
}): ReactElement {
  const kitchen = destination === 'KITCHEN';
  return (
    <span
      className="inline-flex h-[22px] items-center gap-1 rounded-md px-2 text-[11px] font-bold tracking-[0.02em]"
      style={{
        background: kitchen ? 'var(--qs-tk-k-b)' : 'var(--qs-tk-b-b)',
        color: kitchen ? 'var(--qs-tk-k-f)' : 'var(--qs-tk-b-f)',
      }}
    >
      {children ?? (kitchen ? 'Kitchen' : 'Bar')}
    </span>
  );
}

/** FSSAI veg / non-veg marker: square with dot (veg) or triangle (non-veg), labelled for AT. */
export function VegMark({
  isVeg,
  size = 16,
}: {
  isVeg: boolean | null;
  size?: number;
}): ReactElement | null {
  if (isVeg === null) return null;
  return isVeg ? (
    <svg
      role="img"
      aria-label="Vegetarian"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0"
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="3"
        fill="#fff"
        stroke="#0E7A35"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="4.5" fill="#0E7A35" />
    </svg>
  ) : (
    <svg
      role="img"
      aria-label="Non-vegetarian"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="shrink-0"
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="3"
        fill="#fff"
        stroke="#B3261E"
        strokeWidth="2"
      />
      <path d="M12 7.5l5 8.5H7z" fill="#B3261E" />
    </svg>
  );
}
