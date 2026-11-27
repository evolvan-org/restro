import type { QrDisplayStatus } from '@rms/api-contract';
import { formatRupees } from '@rms/shared';

export { formatRupees };

/** The guest page a table's QR code opens. Built from the current origin (staff app host). */
export function guestOrderUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}/t/${token}`;
}

/** "2:14" from a start instant. */
export function formatWaiting(fromIso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - new Date(fromIso).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export type TimerTone = 'neutral' | 'amber' | 'red';

/**
 * Escalation timer tone (CP1): neutral under two thirds of the limit (2:00 of 3:00), amber after,
 * red once escalated or past the limit. Scales with the timeout setting.
 */
export function timerTone(
  submittedAt: string,
  escalationMinutes: number,
  escalated: boolean,
  nowMs: number,
): TimerTone {
  if (escalated) return 'red';
  const elapsed = nowMs - new Date(submittedAt).getTime();
  const limit = escalationMinutes * 60_000;
  if (elapsed >= limit) return 'red';
  if (elapsed >= (limit * 2) / 3) return 'amber';
  return 'neutral';
}

export const STATUS_LABEL: Record<QrDisplayStatus, string> = {
  awaiting: 'Awaiting',
  escalated: 'Escalated',
  approved: 'Approved',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  rejected: 'Rejected',
};

/** CSS variable prefix per status (see globals.css). */
export const STATUS_TOKEN: Record<QrDisplayStatus, string> = {
  awaiting: 'aw',
  escalated: 'es',
  approved: 'ap',
  preparing: 'pp',
  ready: 'rd',
  served: 'sv',
  rejected: 'rj',
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** First name plus last initial, e.g. "Raj Kumar" -> "Raj K". */
export function shortNameOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? name;
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : undefined;
  return last ? `${first} ${last.toUpperCase()}` : first;
}

/** "9:06 pm" in the viewer's locale settings for India. */
export function formatClockTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase();
}

/** "1 min ago" / "12 min" style relative minutes. */
export function minutesAgo(iso: string, nowMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ago`;
}
