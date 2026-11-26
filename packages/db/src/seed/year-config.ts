import { createHash } from 'node:crypto';

import { localTime, Random } from './support';

export const YEAR_DAYS = 365;
export const DEFAULT_SEED = 20261119;

export type YearOptions = { seed?: number; now?: Date };
export type HistoryChunk = { start: number; end: number; live: boolean };

export function parseSeedOptions(args: string[]): YearOptions | null {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !['--months', '--seed', '--now'].includes(key) || !value || values.has(key))
      throw new Error(
        'Usage: seed:restaurant [--months 1|12] [--seed UINT32] [--now ISO_TIMESTAMP]',
      );
    values.set(key, value);
  }
  const months = values.get('--months') ?? '1';
  if (months === '1' && !values.has('--seed') && !values.has('--now')) return null;
  if (months !== '12') throw new Error('Use --months 12 with --seed or --now');
  const seedText = values.get('--seed');
  const seed = seedText === undefined ? undefined : Number(seedText);
  if (seedText !== undefined && (!/^\d+$/.test(seedText) || Number(seed) > 0xffffffff))
    throw new Error('--seed must be an unsigned 32-bit integer');
  const timestamp = values.get('--now');
  const now = timestamp === undefined ? undefined : new Date(timestamp);
  if (timestamp && (!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(timestamp) || !Number.isFinite(now?.getTime())))
    throw new Error('--now must be an ISO timestamp with an explicit timezone');
  return { seed, now };
}

export function yearChunks(now: Date): HistoryChunk[] {
  const chunks: HistoryChunk[] = [];
  let start = -YEAR_DAYS;
  for (let day = start + 1; day <= 0; day++) {
    // Keep yesterday and today in the final chunk even on the first of a month, since
    // the live floor is relative to now and can start shortly before midnight.
    if (day >= -1 || localTime(day, 12, 0, now).getUTCDate() !== 1) continue;
    chunks.push({ start, end: day - 1, live: false });
    start = day;
  }
  chunks.push({ start, end: 0, live: true });
  return chunks;
}

export function fixtureId(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex');
  // Existing feature endpoints require IDs with a UUID v4 version and RFC variant.
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function serviceSlots(day: number, now: Date, rng: Random): Date[] {
  const date = localTime(day, 12, 0, now);
  const weekend = [0, 5, 6].includes(date.getUTCDay());
  const seasonal = [0, 9, 11].includes(date.getUTCMonth()) && date.getUTCDate() <= 7;
  if (day < 0 && (day % 73 === 0 || (!seasonal && rng.chance(0.012)))) return [];
  const growth = (day + YEAR_DAYS) / YEAR_DAYS;
  const slots: Date[] = [];
  for (const [hour, minute, lunch] of [
    [11, 30, true],
    [13, 0, true],
    [14, 30, true],
    [18, 0, false],
    [19, 30, false],
    [21, 0, false],
  ] as const) {
    const demand =
      (lunch ? 0.43 : 0.65) + growth * 0.16 + (weekend ? 0.18 : 0) + (seasonal ? 0.18 : 0);
    // Two captain slots per service time, capped again against actual capacity by the caller.
    for (let i = 0; i < 2; i++) {
      if (rng.chance(demand)) slots.push(localTime(day, hour, minute, now));
    }
  }
  return slots;
}
