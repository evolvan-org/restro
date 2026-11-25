'use client';

import {
  type CostTarget,
  type OnboardingIngredientDraft,
  type OnboardingMenuRow,
  type OnboardingRecipeDishDraft,
  type OnboardingRecipesDraft,
  suggestMerges,
} from '@rms/api-contract';
import { cn } from 'cn';
import { ArrowRight, CircleCheck, Merge, Receipt, Sparkles } from 'lucide-react';
import type { ReactElement } from 'react';

import { CostBandBadge, DietMarker, PriceSourceChip } from '@/components/AiScan/markers';

import { costDish, ingredientKey, type IngredientPrice } from '../../costing';
import {
  Alert,
  btn,
  Card,
  CellSelect,
  CheckSquare,
  Chip,
  GridHead,
  GridRow,
  GridTable,
  Stat,
} from '../../ui/kit';
import { usedIngredients } from './recipe-drafts';

const ING_COLS = '22px minmax(160px,1fr) 150px 96px 260px';

/**
 * Ingredients summary (board "Recipes and costs: ingredients"): de-duplicated, "used in N dishes",
 * merge suggestions ("Curd" and "Dahi"), base unit. Pre-fills Inventory ("From your recipes").
 */
export function RecipeIngredients({
  recipes,
  onChange,
}: {
  recipes: OnboardingRecipesDraft;
  onChange: (patch: Partial<OnboardingRecipesDraft>) => void;
}): ReactElement {
  const used = usedIngredients(recipes);
  const registry = new Map(recipes.ingredients.map((entry) => [ingredientKey(entry.name), entry]));
  const entries = [...used.entries()].sort((a, b) => b[1].dishes - a[1].dishes);
  const dismissed = new Set(recipes.dismissedMerges ?? []);
  const merges = suggestMerges(
    entries.map(([key, entry]) => ({ key, name: entry.name })),
    recipes.ingredients.map((entry) => [entry.name, ...(entry.aliases ?? [])]),
  ).filter((merge) => !dismissed.has(`${merge.keep}|${merge.merge}`));
  const mergeFor = new Map(merges.map((merge) => [merge.keep, merge]));
  const recipeCount = recipes.dishes.filter(
    (dish) => dish.status !== 'no-recipe' && dish.lines.length,
  ).length;

  function applyMerges(list: typeof merges): void {
    const renames = new Map(
      list.map((merge) => [merge.merge, used.get(merge.keep)?.name ?? merge.keep]),
    );
    onChange({
      dishes: recipes.dishes.map((dish) => {
        const lines = dish.lines.map((line) => {
          const target = renames.get(ingredientKey(line.ingredient));
          return target ? { ...line, ingredient: target } : line;
        });
        return {
          ...dish,
          lines: lines.filter(
            (line, index) =>
              lines.findIndex(
                (other) => ingredientKey(other.ingredient) === ingredientKey(line.ingredient),
              ) === index,
          ),
        };
      }),
      ingredients: recipes.ingredients.filter((entry) => !renames.has(ingredientKey(entry.name))),
    });
  }

  function setBaseUnit(key: string, name: string, baseUnit: string): void {
    const existing = registry.get(key);
    const next: OnboardingIngredientDraft = existing
      ? { ...existing, baseUnit }
      : { key, name, baseUnit, estimatedPricePerBase: '', priceSource: 'none' };
    onChange({
      ingredients: existing
        ? recipes.ingredients.map((entry) => (ingredientKey(entry.name) === key ? next : entry))
        : [...recipes.ingredients, next],
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="text-lg font-semibold tracking-[-0.01em]">
          {entries.length} ingredients from {recipeCount} recipes
        </span>
        {merges.length ? (
          <Chip tone="warn">
            <Merge aria-hidden />
            {merges.length} merge {merges.length === 1 ? 'suggestion' : 'suggestions'}
          </Chip>
        ) : (
          <Chip tone="ok">
            <CircleCheck aria-hidden />
            No duplicates left
          </Chip>
        )}
        <span className="flex-1" />
        <button
          type="button"
          className={btn()}
          disabled={merges.length === 0}
          onClick={() => applyMerges(merges)}
        >
          <Merge aria-hidden />
          {merges.length ? 'Accept all merges' : 'Merged'}
        </button>
      </div>
      <div className="flex flex-col items-start gap-5 lg:flex-row">
        <GridTable label="Ingredients" className="w-full flex-1">
          <GridHead cols={ING_COLS}>
            <span />
            <span>Ingredient</span>
            <span>Used in</span>
            <span>Base unit</span>
            <span>Suggestion</span>
          </GridHead>
          {entries.map(([key, entry]) => {
            const merge = mergeFor.get(key);
            const base = (registry.get(key)?.baseUnit || entry.base || 'G').toUpperCase();
            return (
              <GridRow key={key} cols={ING_COLS} tone={merge ? 'problem' : 'default'}>
                <CheckSquare on />
                <div className="flex items-center gap-2">
                  <b className="truncate">{entry.name}</b>
                  <Chip tone="ai" small>
                    <Sparkles aria-hidden />
                    AI
                  </Chip>
                </div>
                <div className="text-sm text-muted-foreground tabular-nums">
                  Used in {entry.dishes} {entry.dishes === 1 ? 'dish' : 'dishes'}
                </div>
                <CellSelect
                  aria-label={`Base unit of ${entry.name}`}
                  value={base}
                  onChange={(event) => setBaseUnit(key, entry.name, event.target.value)}
                  className="w-[76px]"
                >
                  <option value="G">g</option>
                  <option value="ML">ml</option>
                  <option value="UNIT">unit</option>
                </CellSelect>
                <div className="flex flex-wrap items-center gap-2">
                  {merge && (
                    <>
                      <button
                        type="button"
                        onClick={() => applyMerges([merge])}
                        className="inline-flex h-[22px] items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 [&_svg]:size-3"
                      >
                        <Merge aria-hidden />
                        Same as &quot;{used.get(merge.merge)?.name}&quot;? Merge
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-muted-foreground hover:underline"
                        onClick={() =>
                          onChange({
                            dismissedMerges: [
                              ...(recipes.dismissedMerges ?? []),
                              `${merge.keep}|${merge.merge}`,
                            ],
                          })
                        }
                      >
                        Keep both
                      </button>
                    </>
                  )}
                </div>
              </GridRow>
            );
          })}
        </GridTable>
        <Card as="aside" className="w-full flex-none p-[18px] lg:w-[300px]">
          <h3 className="text-sm font-semibold">What happens next</h3>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            These ingredients pre-fill your Inventory step, labelled <b>From your recipes</b>.
            Opening stock and cost stay empty until you add them.
          </p>
        </Card>
      </div>
    </div>
  );
}

/** Margin overview (board "Recipes and costs: margin overview"). */
export function RecipeMargins({
  dishes,
  rows,
  prices,
  target,
  ingredientCount,
  onScanInvoice,
}: {
  dishes: readonly OnboardingRecipeDishDraft[];
  rows: ReadonlyMap<string, OnboardingMenuRow>;
  prices: ReadonlyMap<string, IngredientPrice>;
  target: CostTarget;
  ingredientCount: number;
  onScanInvoice: () => void;
}): ReactElement {
  const costed = dishes
    .filter((dish) => dish.status !== 'no-recipe' && dish.lines.length > 0)
    .map((dish) => ({
      dish,
      row: rows.get(dish.menuRowKey),
      costing: costDish(dish, rows.get(dish.menuRowKey), prices, target),
    }))
    .filter((entry) => entry.costing.main.foodCostPct !== null)
    .sort((a, b) => (b.costing.main.foodCostPct ?? 0) - (a.costing.main.foodCostPct ?? 0));
  const average = costed.length
    ? costed.reduce((sum, entry) => sum + (entry.costing.main.foodCostPct ?? 0), 0) / costed.length
    : null;
  const count = (band: string): number =>
    costed.filter((entry) => entry.costing.main.band === band).length;
  const estimated = [...prices.values()].filter((price) => price.source === 'estimated').length;
  const scaleMax = Math.max(50, ...costed.map((entry) => entry.costing.main.foodCostPct ?? 0));
  const targetAt = (target.max / scaleMax) * 100;
  const averageBand =
    average === null
      ? null
      : costed.length
        ? average <= target.max
          ? 'healthy'
          : average <= target.max + 7
            ? 'watch'
            : 'poor'
        : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Average food cost">
          <div className="mt-1.5 flex items-center gap-2.5">
            <span className="text-[34px] leading-tight font-bold tabular-nums">
              {average === null ? '—' : `${Math.round(average)}%`}
            </span>
            {averageBand && <CostBandBadge band={averageBand} />}
          </div>
          <div className="text-[12.5px] text-muted-foreground">
            Your target: {target.min} – {target.max}%
          </div>
        </Stat>
        <Stat
          label="Average margin"
          value={average === null ? '—' : `${Math.round(100 - average)}%`}
        >
          <div className="text-[12.5px] text-muted-foreground">
            Across {costed.length} dishes with a recipe
          </div>
        </Stat>
        <Stat label="Dishes by band">
          <div className="mt-2 flex flex-col gap-1.5">
            {(['healthy', 'watch', 'poor'] as const).map((band) => (
              <div key={band} className="flex items-center justify-between">
                <CostBandBadge band={band} />
                <b className="tabular-nums">{count(band)}</b>
              </div>
            ))}
          </div>
        </Stat>
        <Stat label="Price basis">
          <div className="mt-2">
            <PriceSourceChip source={estimated ? 'estimated' : 'invoice'} />
          </div>
          <div className="mt-2 text-[12.5px] text-muted-foreground">
            {estimated
              ? `${estimated} of ${ingredientCount} ingredients use estimates.`
              : 'All prices are real.'}
          </div>
        </Stat>
      </div>
      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <Card className="w-full flex-1 p-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Dishes ranked by food cost</h3>
            <span className="text-[12.5px] text-muted-foreground">
              Line marks your {target.max}% target
            </span>
          </div>
          <ol className="mt-2 flex flex-col" aria-label="Dishes ranked by food cost">
            {[...costed].reverse().map(({ dish, row, costing }) => {
              const pct = costing.main.foodCostPct ?? 0;
              const band = costing.main.band ?? 'healthy';
              return (
                <li key={dish.menuRowKey} className="flex h-[30px] items-center gap-2.5">
                  <span className="w-40 truncate text-[13px]">{row?.name}</span>
                  <span className="relative h-3.5 flex-1 rounded bg-muted" aria-hidden>
                    <i
                      className={cn(
                        'absolute inset-y-0 left-0 rounded opacity-85',
                        band === 'healthy'
                          ? 'bg-emerald-700'
                          : band === 'watch'
                            ? 'bg-amber-700'
                            : 'bg-red-700',
                      )}
                      style={{ width: `${Math.min(100, (pct / scaleMax) * 100)}%` }}
                    />
                    <i
                      className="absolute -top-[3px] -bottom-[3px] w-0.5 bg-foreground"
                      style={{ left: `${targetAt}%` }}
                    />
                  </span>
                  <b className="w-[42px] text-right tabular-nums">{Math.round(pct)}%</b>
                  <span className="w-[90px]">
                    <CostBandBadge band={band} />
                  </span>
                </li>
              );
            })}
            {costed.length === 0 && (
              <li className="py-4 text-sm text-muted-foreground">No dishes costed yet.</li>
            )}
          </ol>
        </Card>
        <Card className="w-full flex-none overflow-hidden lg:w-[400px]">
          <div className="flex min-h-[50px] items-center border-b border-border px-3.5">
            <h3 className="text-sm font-semibold">Your lowest-margin dishes</h3>
          </div>
          <ol>
            {costed.slice(0, 5).map(({ dish, row, costing }, index) => (
              <li
                key={dish.menuRowKey}
                className="flex min-h-14 items-center gap-2.5 border-b border-border px-3.5 last:border-b-0"
              >
                <b className="w-[18px] text-muted-foreground tabular-nums">{index + 1}</b>
                <DietMarker diet={row?.dietType} showLabel={false} />
                <span className="min-w-0 flex-1 truncate font-medium">{row?.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  ₹{costing.main.sellingPrice}
                </span>
                <b
                  className={cn(
                    'w-11 text-right tabular-nums',
                    costing.main.band !== 'healthy' && 'text-red-700 dark:text-red-400',
                  )}
                >
                  {Math.round(costing.main.foodCostPct ?? 0)}%
                </b>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      {estimated > 0 && (
        <Alert
          tone="ai"
          icon={<Receipt aria-hidden />}
          action={
            <button type="button" className={btn('ai')} onClick={onScanInvoice}>
              <ArrowRight aria-hidden />
              Scan an invoice next
            </button>
          }
        >
          <b>These use estimated prices.</b> Scan a supplier invoice in the next step to use real
          costs. Margins update right away.
        </Alert>
      )}
    </div>
  );
}
