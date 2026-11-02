import type { RestaurantTable } from '@rms/api-contract';

/**
 * Floor-board attention thresholds. These start as constants and later move to restaurant
 * settings; keeping them here lets the tile, the popover callout and the attention rail agree.
 */
export const TURN_TARGET_MIN = 90;
export const CLEANING_TARGET_MIN = 10;
export const ARRIVING_SOON_MIN = 15;

/** A table flagged for attention, with the reason that triggered it. */
export type AttentionLevel = 'long-seated' | 'cleaning-overdue' | 'arriving-soon';

export function elapsedMinutes(iso: string, nowMs: number): number {
  return Math.max(0, (nowMs - new Date(iso).getTime()) / 60_000);
}

/** Signed minutes until `iso`; negative once it is in the past. */
export function minutesUntil(iso: string, nowMs: number): number {
  return (new Date(iso).getTime() - nowMs) / 60_000;
}

/**
 * Why a table needs attention, or `null` when it is on track:
 * - OCCUPIED past the turn target, NEEDS_CLEANING past the cleaning target, or
 * - RESERVED with a guest arriving within the arriving-soon window.
 */
export function getTableAttention(table: RestaurantTable, nowMs: number): AttentionLevel | null {
  const code = table.currentStatus.code;

  if (code === 'OCCUPIED') {
    return elapsedMinutes(table.statusChangedAt, nowMs) >= TURN_TARGET_MIN ? 'long-seated' : null;
  }
  if (code === 'NEEDS_CLEANING') {
    return elapsedMinutes(table.statusChangedAt, nowMs) >= CLEANING_TARGET_MIN
      ? 'cleaning-overdue'
      : null;
  }
  if (code === 'RESERVED' && table.activeReservation) {
    const until = minutesUntil(table.activeReservation.reservationAt, nowMs);
    return until >= 0 && until <= ARRIVING_SOON_MIN ? 'arriving-soon' : null;
  }
  return null;
}
