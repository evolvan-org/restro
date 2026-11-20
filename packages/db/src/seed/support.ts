import { Prisma } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

export const Decimal = Prisma.Decimal.clone({ precision: 50 });
export type DecimalValue = Prisma.Decimal;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Asia/Kolkata has no DST, so a fixed offset is exact for the seeded restaurant. */
const IST_OFFSET_MINUTES = 330;

/** Deterministic PRNG (mulberry32) so every fresh seed produces the same history. */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error('Cannot pick from an empty list');
    return item;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
    }
    return copy;
  }
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE);
}

/** UTC instant for a wall-clock time in the restaurant's timezone, `dayOffset` days from today. */
export function localTime(dayOffset: number, hour: number, minute = 0, now = new Date()): Date {
  const local = new Date(now.getTime() + IST_OFFSET_MINUTES * MINUTE);
  const midnightUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(
    midnightUtc + dayOffset * DAY + (hour * 60 + minute - IST_OFFSET_MINUTES) * MINUTE,
  );
}

/** A `@db.Date` value `dayOffset` days from today's restaurant-local date. */
export function localDate(dayOffset: number): Date {
  const instant = localTime(dayOffset, 12);
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

/** Indian financial year (April–March) used by bill numbering; mirrors apps/api billing-calc. */
export function financialYear(date: Date): number {
  const local = new Date(date.getTime() + IST_OFFSET_MINUTES * MINUTE);
  const month = local.getUTCMonth() + 1;
  return month >= 4 ? local.getUTCFullYear() : local.getUTCFullYear() - 1;
}

export function roundMoney(value: DecimalValue): DecimalValue {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export const kotNumber = (n: number): string => `KOT-${String(n).padStart(6, '0')}`;
export const billNumber = (year: number, n: number): string =>
  `INV-${year}-${String(n).padStart(6, '0')}`;

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'postgres']);

/**
 * The seed resets passwords on its fixed accounts and writes fake sales history, so refuse to run
 * against anything but a local/compose database unless ALLOW_SEED=1 explicitly opts in.
 */
export function assertSafeSeedTarget(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production');
  }
  if (env.ALLOW_SEED === '1') return;

  let host: string;
  try {
    host = new URL(env.DATABASE_URL ?? '').hostname;
  } catch {
    throw new Error('Refusing to seed: DATABASE_URL is missing or invalid');
  }
  if (!LOCAL_DATABASE_HOSTS.has(host)) {
    throw new Error(
      `Refusing to seed non-local database host "${host}". Set ALLOW_SEED=1 to seed it anyway.`,
    );
  }
}
