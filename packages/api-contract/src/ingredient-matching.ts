import type { Unit } from './stock-items';

/*
 * Deterministic name matching for ingredients and dishes: de-duplication, merge suggestions and
 * invoice-line → ingredient matching. Lists are at most a few hundred entries, so this runs in the
 * browser as the owner types and on the server with the same results.
 */

const PACK_PATTERN =
  /(\d+(?:\.\d+)?)\s*(kgs?|kilo(?:gram)?s?|gms?|grams?|g|ltrs?|litres?|liters?|l|ml|pcs?|pieces?|nos?|units?)\b/i;
const NOISE_WORDS = new Set([
  'fresh',
  'premium',
  'pure',
  'best',
  'quality',
  'pack',
  'packet',
  'pkt',
  'box',
  'bag',
  'tin',
  'jar',
  'bottle',
  'pouch',
  'loose',
  'the',
  'and',
  'of',
]);

/** Lower-case, strip pack sizes / counts / punctuation, drop filler words. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(new RegExp(PACK_PATTERN.source, 'gi'), ' ')
    .replace(/[×x]\s*\d+\b|\b\d+\s*[×x]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word && !NOISE_WORDS.has(word) && !/^\d+$/.test(word))
    .join(' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** 0–100 similarity of two already-normalised names. */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const tokensA = new Set(a.split(' '));
  const tokensB = new Set(b.split(' '));
  const shared = [...tokensA].filter((token) => tokensB.has(token)).length;
  const jaccard = shared / new Set([...tokensA, ...tokensB]).size;
  // "amul paneer" vs "paneer": every token of the shorter name appears in the longer one.
  const containment = shared / Math.min(tokensA.size, tokensB.size);
  const edit = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return Math.round(Math.max(jaccard, containment * 0.92, edit) * 100);
}

export type MatchCandidate = { key: string; name: string; aliases?: readonly string[] };
export type MatchResult = { key: string; name: string; score: number };

/** Best candidates for `text` (score ≥ `minScore`), strongest first. Aliases count as names. */
export function matchName(
  text: string,
  candidates: readonly MatchCandidate[],
  options: { limit?: number; minScore?: number } = {},
): MatchResult[] {
  const { limit = 3, minScore = 50 } = options;
  const query = normalizeName(text);
  if (!query) return [];
  const results: MatchResult[] = [];
  for (const candidate of candidates) {
    const names = [candidate.name, ...(candidate.aliases ?? [])];
    const score = Math.max(...names.map((name) => nameSimilarity(query, normalizeName(name))));
    if (score >= minScore) results.push({ key: candidate.key, name: candidate.name, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export type MergeSuggestion = {
  keep: string;
  merge: string;
  score: number;
  reason: 'alias' | 'similar';
};

/**
 * Pairs that are probably the same ingredient ("Curd" and "Dahi"). `aliasGroups` are known
 * synonym sets (from the ingredient catalog); otherwise names must be very similar.
 */
export function suggestMerges(
  items: readonly MatchCandidate[],
  aliasGroups: readonly (readonly string[])[] = [],
): MergeSuggestion[] {
  const groupOf = new Map<string, number>();
  aliasGroups.forEach((group, index) =>
    group.forEach((name) => groupOf.set(normalizeName(name), index)),
  );
  const suggestions: MergeSuggestion[] = [];
  const merged = new Set<string>();
  for (let i = 0; i < items.length; i += 1) {
    const a = items[i];
    if (!a || merged.has(a.key)) continue;
    const nameA = normalizeName(a.name);
    for (let j = i + 1; j < items.length; j += 1) {
      const b = items[j];
      if (!b || merged.has(b.key)) continue;
      const nameB = normalizeName(b.name);
      const groupA = groupOf.get(nameA);
      if (groupA !== undefined && groupA === groupOf.get(nameB)) {
        suggestions.push({ keep: a.key, merge: b.key, score: 100, reason: 'alias' });
        merged.add(b.key);
        continue;
      }
      const score = nameSimilarity(nameA, nameB);
      if (score >= 88) {
        suggestions.push({ keep: a.key, merge: b.key, score, reason: 'similar' });
        merged.add(b.key);
      }
    }
  }
  return suggestions;
}

const PACK_UNITS: Record<string, Unit> = {
  kg: 'KG',
  kgs: 'KG',
  kilo: 'KG',
  kilos: 'KG',
  kilogram: 'KG',
  kilograms: 'KG',
  g: 'G',
  gm: 'G',
  gms: 'G',
  gram: 'G',
  grams: 'G',
  l: 'L',
  ltr: 'L',
  ltrs: 'L',
  litre: 'L',
  litres: 'L',
  liter: 'L',
  liters: 'L',
  ml: 'ML',
  pc: 'UNIT',
  pcs: 'UNIT',
  piece: 'UNIT',
  pieces: 'UNIT',
  no: 'UNIT',
  nos: 'UNIT',
  unit: 'UNIT',
  units: 'UNIT',
};

/** Pack size printed in an invoice description: "AMUL PANEER 1KG" → { size: 1, unit: KG }. */
export function parsePackSize(text: string): { size: number; unit: Unit } | null {
  const match = PACK_PATTERN.exec(text);
  if (!match?.[1] || !match[2]) return null;
  const unit = PACK_UNITS[match[2].toLowerCase()];
  const size = Number(match[1]);
  if (!unit || !(size > 0)) return null;
  return { size, unit };
}

/** Same dish, as far as a menu goes: "Paneer Tikka" vs "Paneer Tikka (Tandoori)". */
export function dishKey(name: string): string {
  return normalizeName(name.replace(/\([^)]*\)/g, ' '));
}
