import type { RestaurantTable } from '@rms/api-contract';

type SearchableTable = Pick<RestaurantTable, 'tableNumber' | 'capacity' | 'isActive'> & {
  section: Pick<RestaurantTable['section'], 'name'>;
};

const TIER_EXACT_NUMBER = 0;
const TIER_PARTIAL_NUMBER = 1;
const TIER_CAPACITY = 2;
const TIER_SECTION = 3;
const NO_MATCH = Number.POSITIVE_INFINITY;

function matchTier(table: SearchableTable, q: string, numericQuery: number | null): number {
  const tableNumber = table.tableNumber.toLowerCase();
  if (tableNumber === q) return TIER_EXACT_NUMBER;
  if (tableNumber.includes(q)) return TIER_PARTIAL_NUMBER;
  // Capacity: "at least N" seats, so the best fit (smallest) can be listed first.
  if (numericQuery !== null && table.capacity >= numericQuery) return TIER_CAPACITY;
  if (table.section.name.toLowerCase().includes(q)) return TIER_SECTION;
  return NO_MATCH;
}

/**
 * Free-text floor search over active tables: table number, seating capacity (at least N) and
 * dining section name. Case-insensitive, trims the query, and returns an empty-query input as-is.
 * Ordering: exact number, partial number, capacity (ascending), section; ties keep input order.
 */
export function searchTables<T extends SearchableTable>(tables: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...tables];
  const numericQuery = /^\d+$/.test(q) ? Number(q) : null;

  return tables
    .filter((table) => table.isActive)
    .map((table, index) => ({ table, index, tier: matchTier(table, q, numericQuery) }))
    .filter((entry) => entry.tier !== NO_MATCH)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        (a.tier === TIER_CAPACITY ? a.table.capacity - b.table.capacity : 0) ||
        a.index - b.index,
    )
    .map((entry) => entry.table);
}
