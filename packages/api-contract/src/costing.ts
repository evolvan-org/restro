import type { Unit } from './stock-items';

/*
 * Food-cost arithmetic shared by the API and the web app, so a margin shown while the owner edits a
 * recipe is the same number the server reports later. Costs are estimates for display: plain
 * numbers in rupees, rounded only when shown.
 */

export type CostBaseUnit = 'G' | 'ML' | 'UNIT';
export type CostBand = 'healthy' | 'watch' | 'poor';
export type CostTarget = { min: number; max: number };

export const DEFAULT_FOOD_COST_TARGET: CostTarget = { min: 30, max: 35 };
/** "Watch" spans this many percentage points above the target's upper bound. */
export const COST_BAND_WATCH_POINTS = 7;

const UNIT_TO_BASE: Record<Unit, { base: CostBaseUnit; factor: number }> = {
  G: { base: 'G', factor: 1 },
  KG: { base: 'G', factor: 1000 },
  ML: { base: 'ML', factor: 1 },
  L: { base: 'ML', factor: 1000 },
  UNIT: { base: 'UNIT', factor: 1 },
};

export function baseUnitOf(unit: Unit): CostBaseUnit {
  return UNIT_TO_BASE[unit].base;
}

/** Quantity in the unit's base (g, ml or unit): 1.5 KG → 1500. */
export function toBaseQuantity(quantity: number, unit: Unit): number {
  return quantity * UNIT_TO_BASE[unit].factor;
}

/** Whether a recipe unit can be costed against an ingredient stocked in `base`. */
export function unitFitsBase(unit: Unit, base: CostBaseUnit): boolean {
  return UNIT_TO_BASE[unit].base === base;
}

export type CostLine = {
  quantity: number;
  unit: Unit;
  /** ₹ per base unit of the ingredient; null when unknown. */
  pricePerBase: number | null;
};

export function lineCost(line: CostLine): number | null {
  if (line.pricePerBase === null || !Number.isFinite(line.quantity)) return null;
  return toBaseQuantity(line.quantity, line.unit) * line.pricePerBase;
}

export function plateCost(lines: readonly CostLine[]): { total: number; missingPrices: number } {
  let total = 0;
  let missingPrices = 0;
  for (const line of lines) {
    const cost = lineCost(line);
    if (cost === null) missingPrices += 1;
    else total += cost;
  }
  return { total, missingPrices };
}

export function foodCostPercent(cost: number, sellingPrice: number): number | null {
  if (!(sellingPrice > 0)) return null;
  return (cost / sellingPrice) * 100;
}

export function marginPercent(cost: number, sellingPrice: number): number | null {
  const pct = foodCostPercent(cost, sellingPrice);
  return pct === null ? null : 100 - pct;
}

export function costBand(
  foodCostPct: number,
  target: CostTarget = DEFAULT_FOOD_COST_TARGET,
): CostBand {
  if (foodCostPct <= target.max) return 'healthy';
  if (foodCostPct <= target.max + COST_BAND_WATCH_POINTS) return 'watch';
  return 'poor';
}

export const COST_BAND_LABELS: Record<CostBand, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  poor: 'Poor',
};

/** Recipe multiplier implied by a portion name; owners can change it later. */
export function portionFactorForVariant(name: string): number {
  const value = name.trim().toLowerCase();
  if (/\bquarter\b|\bqtr\b/.test(value)) return 0.25;
  if (/\bhalf\b|\bh\b/.test(value)) return 0.5;
  if (/\bfull\b|\bf\b|\bregular\b/.test(value)) return 1;
  if (/\blarge\b|\bjumbo\b/.test(value)) return 1.5;
  if (/\bsmall\b|\bmini\b/.test(value)) return 0.75;
  return 1;
}

/** Base quantity bought: 5 packs × 1 KG → 5000 g. A missing pack size means `quantity` is in `unit`. */
export function convertPack(input: {
  quantity: number;
  packSize: number | null;
  packUnit: Unit | null;
}): { base: number; baseUnit: CostBaseUnit } | null {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return null;
  if (input.packSize === null || input.packUnit === null || !(input.packSize > 0)) return null;
  return {
    base: input.quantity * toBaseQuantity(input.packSize, input.packUnit),
    baseUnit: baseUnitOf(input.packUnit),
  };
}

export type InvoiceTotals = {
  lineAmounts: readonly number[];
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  roundOff: number | null;
  total: number | null;
};

/** Lines + taxes + round-off must equal the printed total (within ₹1), or costs can't be applied. */
export const INVOICE_TOTAL_TOLERANCE = 1;

export function invoiceTotalCheck(input: InvoiceTotals): {
  computed: number;
  delta: number | null;
  ok: boolean;
} {
  const computed =
    input.lineAmounts.reduce((sum, value) => sum + value, 0) +
    (input.cgst ?? 0) +
    (input.sgst ?? 0) +
    (input.igst ?? 0) +
    (input.roundOff ?? 0);
  if (input.total === null) return { computed, delta: null, ok: false };
  const delta = Math.round((computed - input.total) * 100) / 100;
  return { computed, delta, ok: Math.abs(delta) <= INVOICE_TOTAL_TOLERANCE };
}

export function priceJumpPercent(previous: number, next: number): number | null {
  if (!(previous > 0)) return null;
  return ((next - previous) / previous) * 100;
}

export type MarginSnapshot = { key: string; name: string; foodCostPct: number | null };
export type MarginChange = {
  key: string;
  name: string;
  before: number;
  after: number;
  /** Positive = the dish now costs more to make. */
  delta: number;
};

/** Dishes whose food cost moved by at least half a point, biggest change first. */
export function marginDiff(
  before: readonly MarginSnapshot[],
  after: readonly MarginSnapshot[],
): MarginChange[] {
  const previous = new Map(before.map((row) => [row.key, row]));
  const changes: MarginChange[] = [];
  for (const row of after) {
    const old = previous.get(row.key);
    if (!old || old.foodCostPct === null || row.foodCostPct === null) continue;
    const delta = row.foodCostPct - old.foodCostPct;
    if (Math.abs(delta) < 0.5) continue;
    changes.push({
      key: row.key,
      name: row.name,
      before: old.foodCostPct,
      after: row.foodCostPct,
      delta,
    });
  }
  return changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** ₹ with Indian digit grouping: 124350 → ₹1,24,350; 13960 with 2 decimals → ₹13,960.00. */
export function formatInr(value: number, decimals = 0): string {
  const negative = value < 0;
  const [whole = '0', fraction] = Math.abs(value).toFixed(decimals).split('.');
  let grouped = whole;
  if (whole.length > 3) {
    const head = whole.slice(0, -3);
    const tail = whole.slice(-3);
    grouped = `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}`;
  }
  return `${negative ? '-' : ''}₹${grouped}${fraction ? `.${fraction}` : ''}`;
}

export function parseDecimal(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().replace(/,/g, '');
  if (!trimmed || !/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}
