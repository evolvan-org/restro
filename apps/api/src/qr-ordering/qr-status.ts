import type { QrDisplayStatus } from '@rms/api-contract';

type KotState = { status: 'PENDING' | 'PREPARING' | 'READY' | 'COMPLETED' };

/**
 * One display status for a round, shared by the guest tracker, captain queue and floor board.
 * Approval states come from the round; kitchen states are derived from its tickets:
 * any ticket started → preparing; every ticket Ready or done → ready; every ticket done → served.
 */
export function roundDisplayStatus(
  round: { status: 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED'; escalatedAt: Date | null },
  kots: readonly KotState[],
): QrDisplayStatus {
  if (round.status === 'REJECTED') return 'rejected';
  if (round.status === 'AWAITING_APPROVAL') return round.escalatedAt ? 'escalated' : 'awaiting';
  if (kots.length === 0) return 'approved';
  if (kots.every((kot) => kot.status === 'COMPLETED')) return 'served';
  if (kots.every((kot) => kot.status === 'READY' || kot.status === 'COMPLETED')) return 'ready';
  if (kots.some((kot) => kot.status !== 'PENDING')) return 'preparing';
  return 'approved';
}

/** Minutes after which a waiting round escalates; clamps a bad setting into the allowed range. */
export function escalationDeadline(submittedAt: Date, minutes: number): Date {
  const safe = Math.min(15, Math.max(1, Math.round(minutes)));
  return new Date(submittedAt.getTime() + safe * 60_000);
}

/** A captain counts as available while active and seen in the last 15 minutes. */
export const CAPTAIN_PRESENCE_WINDOW_MS = 15 * 60_000;

export function isCaptainAvailable(
  captain: { status: string; lastSeenAt: Date | null } | null,
  now: Date,
): boolean {
  if (!captain || captain.status !== 'ACTIVE' || !captain.lastSeenAt) return false;
  return now.getTime() - captain.lastSeenAt.getTime() <= CAPTAIN_PRESENCE_WINDOW_MS;
}

/** First name for guest-facing copy ("Your server: Arjun"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Up to two initials for the restaurant logo mark ("The Spice Room" → "SR"). */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => !/^(the|a|an|&)$/i.test(word));
  const letters = (words.length ? words : [name]).map((word) => word[0]?.toUpperCase() ?? '');
  return letters.slice(0, 2).join('') || '?';
}
