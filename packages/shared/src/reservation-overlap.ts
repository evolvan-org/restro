/** Fixed service window shared by booking, editing, and table assignment. */
export const RESERVATION_DURATION_MINUTES = 90;

/** Exact end/start boundaries do not overlap. Inputs are validated reservation timestamps. */
export function hasOverlap(firstStart: Date, secondStart: Date): boolean {
  return (
    Math.abs(firstStart.getTime() - secondStart.getTime()) < RESERVATION_DURATION_MINUTES * 60_000
  );
}

/** Open bounds for querying other starts that overlap a reservation's service window. */
export function getReservationOverlapWindow(start: Date): { from: Date; to: Date } {
  const durationMs = RESERVATION_DURATION_MINUTES * 60_000;
  return {
    from: new Date(start.getTime() - durationMs),
    to: new Date(start.getTime() + durationMs),
  };
}
