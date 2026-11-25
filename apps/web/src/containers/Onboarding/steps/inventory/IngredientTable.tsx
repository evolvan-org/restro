'use client';

import {
  type OnboardingInventoryRow,
  type OnboardingRowIssue,
  parseDecimal,
} from '@rms/api-contract';
import { Sparkles, Trash2 } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { PriceSourceChip } from '@/components/AiScan/markers';

import {
  CellInput,
  CellSelect,
  CheckSquare,
  Chip,
  GridHead,
  GridRow,
  GridTable,
} from '../../ui/kit';

const COLS = '22px minmax(180px,1.3fr) 96px 92px 112px 128px 150px 32px';
const COMPACT_COLS = '22px minmax(130px,1fr) 84px 72px 96px 116px 128px';
const SHOWN = 12;

const perDisplay = (base: string): { factor: number; unit: string } =>
  base === 'UNIT'
    ? { factor: 1, unit: 'unit' }
    : { factor: 1000, unit: base === 'ML' ? 'l' : 'kg' };

function costSource(row: OnboardingInventoryRow): 'invoice' | 'manual' | 'estimated' | 'none' {
  if (row.openingUnitCost.trim()) return row.costSource === 'invoice' ? 'invoice' : 'manual';
  return row.estimatedUnitCost?.trim() ? 'estimated' : 'none';
}

/**
 * The ingredient list (boards "Inventory: pre-filled / live margin update"): base unit, reorder level,
 * opening quantity and unit cost (shown per kg / litre / unit), and where the price comes from.
 */
export function IngredientTable({
  rows,
  issues,
  highlight,
  onChange,
  onRemove,
  compact = false,
}: {
  rows: readonly OnboardingInventoryRow[];
  issues: ReadonlyMap<number, OnboardingRowIssue[]>;
  /** Rows just updated from an invoice. */
  highlight?: ReadonlySet<string>;
  onChange: (key: string, patch: Partial<OnboardingInventoryRow>) => void;
  onRemove?: (key: string) => void;
  /** Narrow layout (beside the before → after list): no recipe chip, no remove column. */
  compact?: boolean;
}): ReactElement {
  const cols = compact ? COMPACT_COLS : COLS;
  const [showAll, setShowAll] = useState(false);
  const indexed = rows.map((row, index) => ({ row, index }));
  const ordered = [
    ...indexed.filter(({ index }) => issues.has(index)),
    ...indexed.filter(({ index }) => !issues.has(index)),
  ];
  const visible = showAll
    ? ordered
    : ordered.slice(0, Math.max(SHOWN, indexed.filter(({ index }) => issues.has(index)).length));

  return (
    <GridTable label="Ingredients">
      <GridHead cols={cols}>
        <span />
        <span>Ingredient</span>
        <span>Base unit</span>
        <span className="text-right">Reorder</span>
        <span className="text-right">Opening qty</span>
        <span className="text-right">Unit cost</span>
        <span>Price source</span>
        {!compact && <span />}
      </GridHead>
      {visible.map(({ row, index }) => {
        const rowIssues = issues.get(index) ?? [];
        const bad = (field: string): boolean => rowIssues.some((issue) => issue.field === field);
        const base = row.baseUnit.toUpperCase();
        const { factor, unit } = perDisplay(base);
        const real = parseDecimal(row.openingUnitCost);
        const estimate = parseDecimal(row.estimatedUnitCost);
        const label = row.name || `row ${index + 1}`;
        return (
          <GridRow
            key={row.key}
            cols={cols}
            tone={rowIssues.length ? 'problem' : highlight?.has(row.key) ? 'new' : 'default'}
          >
            <CheckSquare on={rowIssues.length === 0} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CellInput
                  aria-label={`Ingredient name, ${label}`}
                  value={row.name}
                  invalid={bad('name')}
                  onChange={(event) => onChange(row.key, { name: event.target.value })}
                  className="font-semibold"
                />
                {row.origin === 'recipe' && !compact && (
                  <Chip tone="ai" small className="hidden xl:inline-flex">
                    <Sparkles aria-hidden />
                    From your recipes
                  </Chip>
                )}
              </div>
              {rowIssues.map((issue) => (
                <div key={issue.field} className="text-xs text-red-700 dark:text-red-400">
                  {issue.message}
                </div>
              ))}
            </div>
            <CellSelect
              aria-label={`Base unit, ${label}`}
              value={base}
              onChange={(event) => onChange(row.key, { baseUnit: event.target.value })}
              className="w-[76px]"
            >
              {!['G', 'ML', 'UNIT'].includes(base) && (
                <option value={row.baseUnit}>{row.baseUnit || '—'}</option>
              )}
              <option value="G">g</option>
              <option value="ML">ml</option>
              <option value="UNIT">unit</option>
            </CellSelect>
            <CellInput
              aria-label={`Reorder level, ${label}`}
              inputMode="decimal"
              value={row.reorderLevel}
              invalid={bad('reorderLevel')}
              onChange={(event) => onChange(row.key, { reorderLevel: event.target.value })}
              className="text-right tabular-nums"
            />
            <CellInput
              aria-label={`Opening quantity, ${label}`}
              inputMode="decimal"
              placeholder="—"
              value={row.openingQuantity}
              invalid={bad('openingQuantity')}
              onChange={(event) => onChange(row.key, { openingQuantity: event.target.value })}
              className="text-right font-semibold tabular-nums"
            />
            <label className="flex items-center justify-end gap-0.5 text-sm">
              <span className="text-muted-foreground">₹</span>
              <CellInput
                aria-label={`Unit cost per ${unit}, ${label}`}
                inputMode="decimal"
                placeholder={estimate ? String(Math.round(estimate * factor * 100) / 100) : '—'}
                value={
                  real === null
                    ? row.openingUnitCost
                    : String(Math.round(real * factor * 100) / 100)
                }
                invalid={bad('openingUnitCost')}
                onChange={(event) => {
                  const value = event.target.value;
                  const parsed = parseDecimal(value);
                  onChange(row.key, {
                    openingUnitCost:
                      parsed === null ? value : (parsed / factor).toFixed(6).replace(/\.?0+$/, ''),
                    costSource: 'manual',
                  });
                }}
                className="mx-0 w-[72px] text-right tabular-nums"
              />
              <span className="text-xs text-muted-foreground">/{unit}</span>
            </label>
            <div>
              <PriceSourceChip
                source={costSource(row)}
                label={costSource(row) === 'estimated' ? 'Estimated' : undefined}
              />
            </div>
            {compact ? null : onRemove ? (
              <button
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() => onRemove(row.key)}
                className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            ) : (
              <span />
            )}
          </GridRow>
        );
      })}
      {ordered.length > visible.length && (
        <button
          type="button"
          className="w-full px-3.5 py-3 text-left text-[13px] text-muted-foreground hover:bg-muted"
          onClick={() => setShowAll(true)}
        >
          + {ordered.length - visible.length} more ingredients
        </button>
      )}
    </GridTable>
  );
}
