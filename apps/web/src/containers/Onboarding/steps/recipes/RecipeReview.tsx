'use client';

import {
  type CostTarget,
  formatInr,
  type OnboardingMenuRow,
  type OnboardingRecipeDishDraft,
  type OnboardingRecipeLineDraft,
  PORTION_STYLE_LABELS,
  type PortionStyle,
} from '@rms/api-contract';
import { cn } from 'cn';
import { CircleCheck, Plus, Sparkles, X } from 'lucide-react';
import { type KeyboardEvent, type ReactElement, useMemo, useRef, useState } from 'react';

import {
  AiSuggestedChip,
  ApprovedChip,
  CostBandBadge,
  CostMeter,
  DietMarker,
  EditedChip,
  LowConfidenceChip,
  PriceSourceChip,
} from '@/components/AiScan/markers';

import {
  costDish,
  costLine,
  type DishCosting,
  type IngredientPrice,
  pricePerDisplayUnit,
} from '../../costing';
import { newKey } from '../../keys';
import {
  Alert,
  btn,
  Card,
  CellInput,
  CellSelect,
  Chip,
  GridHead,
  GridRow,
  Kbd,
  KeyHint,
  Pills,
  Tag,
} from '../../ui/kit';
import { dishNeedsAttention } from './recipe-drafts';

type Filter = 'attention' | 'all' | 'approved';
const UNITS = ['G', 'KG', 'ML', 'L', 'UNIT'] as const;
const LINE_COLS = '28px minmax(150px,1fr) 84px 72px 128px 90px';

/**
 * Split-view recipe review (board "Recipes and costs: review"): dishes on the left, the recipe on
 * the right with live plate cost, food cost, band and margin. A approves and moves on, E edits.
 */
export function RecipeReview({
  dishes,
  rows,
  prices,
  target,
  portionStyle,
  ingredientNames,
  onChange,
}: {
  dishes: readonly OnboardingRecipeDishDraft[];
  rows: ReadonlyMap<string, OnboardingMenuRow>;
  prices: ReadonlyMap<string, IngredientPrice>;
  target: CostTarget;
  portionStyle: PortionStyle;
  ingredientNames: readonly string[];
  onChange: (dishes: OnboardingRecipeDishDraft[]) => void;
}): ReactElement {
  const costings = useMemo(
    () =>
      new Map(
        dishes.map((dish) => [
          dish.menuRowKey,
          costDish(dish, rows.get(dish.menuRowKey), prices, target),
        ]),
      ),
    [dishes, rows, prices, target],
  );
  const attention = dishes.filter((dish) =>
    dishNeedsAttention(dish, costings.get(dish.menuRowKey)!),
  );
  const [filter, setFilter] = useState<Filter>(attention.length ? 'attention' : 'all');
  const listed = dishes.filter((dish) =>
    filter === 'attention'
      ? dishNeedsAttention(dish, costings.get(dish.menuRowKey)!)
      : filter === 'approved'
        ? dish.status !== 'draft'
        : true,
  );
  const [selectedKey, setSelectedKey] = useState<string | undefined>(listed[0]?.menuRowKey);
  const selected = dishes.find((dish) => dish.menuRowKey === selectedKey) ?? listed[0] ?? dishes[0];
  const editorRef = useRef<HTMLDivElement>(null);
  const drafts = dishes.filter((dish) => dish.status === 'draft');
  const approved = dishes.length - drafts.length;

  const updateDish = (key: string, patch: Partial<OnboardingRecipeDishDraft>): void =>
    onChange(dishes.map((dish) => (dish.menuRowKey === key ? { ...dish, ...patch } : dish)));

  function approve(dish: OnboardingRecipeDishDraft): void {
    if (!dish.lines.length) return;
    updateDish(dish.menuRowKey, { status: 'approved' });
    const index = dishes.findIndex((entry) => entry.menuRowKey === dish.menuRowKey);
    const next = [...dishes.slice(index + 1), ...dishes.slice(0, index)].find(
      (entry) => entry.status === 'draft',
    );
    if (next) setSelectedKey(next.menuRowKey);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const element = event.target as HTMLElement;
    if (
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) ||
      event.metaKey ||
      event.ctrlKey ||
      !selected
    )
      return;
    if (event.key.toLowerCase() === 'a') {
      event.preventDefault();
      approve(selected);
    } else if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      editorRef.current?.querySelector<HTMLInputElement>('input[data-quantity]')?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-4" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-[-0.01em] tabular-nums">
            {drafts.length} {drafts.length === 1 ? 'dish' : 'dishes'} left to approve
          </span>
          <span className="text-muted-foreground">{approved} approved</span>
        </div>
        <span className="flex items-center gap-4">
          <KeyHint keyLabel="A">approve</KeyHint>
          <KeyHint keyLabel="E">edit</KeyHint>
        </span>
      </div>

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <Card className="flex w-full flex-none flex-col overflow-hidden lg:w-[340px]">
          <div className="border-b border-border px-3.5 py-3">
            <Pills
              label="Show dishes"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'attention', label: `Needs attention · ${attention.length}` },
                { value: 'all', label: `All · ${dishes.length}` },
                { value: 'approved', label: `Approved · ${approved}` },
              ]}
            />
          </div>
          <ul className="flex max-h-[600px] flex-col overflow-y-auto" aria-label="Dishes">
            {listed.map((dish) => {
              const row = rows.get(dish.menuRowKey);
              const costing = costings.get(dish.menuRowKey)!;
              const isSelected = dish.menuRowKey === selected?.menuRowKey;
              const pct = costing.main.foodCostPct;
              return (
                <li key={dish.menuRowKey}>
                  <button
                    type="button"
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => setSelectedKey(dish.menuRowKey)}
                    className={cn(
                      'flex min-h-14 w-full items-center gap-2.5 border-b border-border px-3.5 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600',
                      isSelected
                        ? 'bg-muted shadow-[inset_3px_0_0_var(--primary)]'
                        : 'hover:bg-muted/60',
                    )}
                  >
                    <DietMarker diet={row?.dietType} showLabel={false} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{row?.name ?? 'Dish'}</span>
                      <span className="mt-[3px] block">
                        {dish.status === 'approved' ? (
                          <ApprovedChip />
                        ) : dish.status === 'no-recipe' ? (
                          <Chip>No recipe needed</Chip>
                        ) : dishNeedsAttention(dish, costing) ? (
                          <LowConfidenceChip label="Check" />
                        ) : (
                          <AiSuggestedChip label="Draft" />
                        )}
                      </span>
                    </span>
                    {pct !== null && (
                      <span className="flex flex-col items-end gap-1">
                        <b className="tabular-nums">{Math.round(pct)}%</b>
                        {costing.main.band && <CostBandBadge band={costing.main.band} />}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {listed.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">Nothing here.</li>
            )}
          </ul>
          <div className="border-t border-border px-3.5 py-3">
            <button
              type="button"
              className={cn(btn('default', 'sm'), 'w-full')}
              disabled={drafts.length === 0}
              onClick={() =>
                onChange(
                  dishes.map((dish) =>
                    dish.status === 'draft' &&
                    dish.lines.length > 0 &&
                    !costings.get(dish.menuRowKey)!.unitMismatches
                      ? { ...dish, status: 'approved' }
                      : dish,
                  ),
                )
              }
            >
              <CircleCheck aria-hidden />
              Approve all {drafts.length} drafts
            </button>
          </div>
        </Card>

        <div ref={editorRef} className="w-full min-w-0 flex-1">
          {selected ? (
            <DishEditor
              key={selected.menuRowKey}
              dish={selected}
              row={rows.get(selected.menuRowKey)}
              costing={costings.get(selected.menuRowKey)!}
              prices={prices}
              target={target}
              portionStyle={portionStyle}
              ingredientNames={ingredientNames}
              onChange={(patch) => updateDish(selected.menuRowKey, patch)}
              onApprove={() => approve(selected)}
            />
          ) : (
            <Card className="p-6 text-sm text-muted-foreground">
              Recipes appear here as they are drafted.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DishEditor({
  dish,
  row,
  costing,
  prices,
  target,
  portionStyle,
  ingredientNames,
  onChange,
  onApprove,
}: {
  dish: OnboardingRecipeDishDraft;
  row: OnboardingMenuRow | undefined;
  costing: DishCosting;
  prices: ReadonlyMap<string, IngredientPrice>;
  target: CostTarget;
  portionStyle: PortionStyle;
  ingredientNames: readonly string[];
  onChange: (patch: Partial<OnboardingRecipeDishDraft>) => void;
  onApprove: () => void;
}): ReactElement {
  const listId = `ingredients-${dish.menuRowKey}`;
  const noRecipe = dish.status === 'no-recipe';
  const main = costing.main;
  const realLines = dish.lines.filter(
    (line) => costLine(line, prices).price?.source === 'invoice',
  ).length;
  const updateLine = (key: string, patch: Partial<OnboardingRecipeLineDraft>): void =>
    onChange({
      status: dish.status === 'approved' ? 'draft' : dish.status,
      lines: dish.lines.map((line) =>
        line.key === key ? { ...line, ...patch, edited: true } : line,
      ),
    });

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-start gap-2.5 border-b border-border p-4">
        <span className="mt-[3px]">
          <DietMarker diet={row?.dietType} showLabel={false} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">{row?.name}</h2>
            {row?.originalName && (
              <span className="text-muted-foreground" lang="hi">
                {row.originalName}
              </span>
            )}
            {dish.status === 'approved' ? (
              <ApprovedChip />
            ) : dish.fromAi ? (
              <AiSuggestedChip />
            ) : (
              <EditedChip />
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {row?.category && <Chip>{row.category}</Chip>}
            {row && <Chip>{row.type.toUpperCase()}</Chip>}
            <Chip>{PORTION_STYLE_LABELS[portionStyle]} portion</Chip>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btn('default', 'sm')}
            onClick={() => onChange({ status: noRecipe ? 'draft' : 'no-recipe' })}
          >
            {noRecipe ? 'Needs a recipe' : 'No recipe needed'}
          </button>
          {!noRecipe && (
            <button
              type="button"
              className={btn('primary', 'sm')}
              disabled={dish.status === 'approved' || dish.lines.length === 0}
              onClick={onApprove}
            >
              <CircleCheck aria-hidden />
              {dish.status === 'approved' ? 'Approved' : 'Approve'} <Kbd>A</Kbd>
            </button>
          )}
        </div>
      </div>

      {noRecipe ? (
        <div className="p-4">
          <Alert>
            Bought in and resold as-is (like bottled drinks). It won&apos;t be listed as missing a
            recipe, and it has no food cost.
          </Alert>
        </div>
      ) : (
        <>
          {dish.note && (
            <Alert tone="ai" icon={<Sparkles aria-hidden />} className="mx-4 mt-3">
              <span className="text-[13px]">
                <b>Why this recipe.</b> {dish.note}
              </span>
            </Alert>
          )}
          <div className="mx-4 mt-3 overflow-x-auto rounded-[9px] border border-border">
            <div
              role="table"
              aria-label={`Recipe for ${row?.name ?? 'dish'}`}
              className="min-w-fit"
            >
              <GridHead cols={LINE_COLS}>
                <span />
                <span>Ingredient</span>
                <span className="text-right">Qty</span>
                <span>Unit</span>
                <span className="text-right">Price</span>
                <span className="text-right">Line cost</span>
              </GridHead>
              {dish.lines.map((line) => {
                const result = costLine(line, prices);
                const low = !line.edited && (line.confidence ?? 100) < 75;
                const per = result.price?.pricePerBase
                  ? pricePerDisplayUnit(result.price.pricePerBase, result.price.baseUnit)
                  : null;
                return (
                  <GridRow
                    key={line.key}
                    cols={LINE_COLS}
                    tone={line.edited ? 'default' : 'default'}
                    className="min-h-[58px]"
                  >
                    <button
                      type="button"
                      aria-label={`Remove ${line.ingredient || 'ingredient'}`}
                      onClick={() =>
                        onChange({ lines: dish.lines.filter((entry) => entry.key !== line.key) })
                      }
                      className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                    <div className="min-w-0">
                      <CellInput
                        list={listId}
                        aria-label="Ingredient"
                        value={line.ingredient}
                        onChange={(event) =>
                          updateLine(line.key, { ingredient: event.target.value })
                        }
                        className="font-medium"
                      />
                      {(low || line.edited || result.unitMismatch) && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {low && <LowConfidenceChip label="Check qty" small />}
                          {line.edited && <EditedChip label="Edited" small />}
                          {result.unitMismatch && (
                            <span className="text-[11.5px] text-red-700 dark:text-red-400">
                              Stocked in {result.price?.baseUnit?.toLowerCase()}; pick a matching
                              unit
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <input
                      data-quantity
                      inputMode="decimal"
                      aria-label={`Quantity of ${line.ingredient || 'ingredient'}`}
                      value={line.quantity}
                      onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                      className={cn(
                        'h-9 w-[84px] rounded-md border border-zinc-300 bg-background px-2.5 text-right text-sm tabular-nums outline-none focus:border-foreground focus:shadow-[0_0_0_3px_var(--border)] dark:border-zinc-700',
                        line.edited && 'border-foreground',
                      )}
                    />
                    <CellSelect
                      aria-label={`Unit of ${line.ingredient || 'ingredient'}`}
                      value={line.unit.toUpperCase()}
                      onChange={(event) => updateLine(line.key, { unit: event.target.value })}
                      className="w-[68px]"
                    >
                      {UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit.toLowerCase()}
                        </option>
                      ))}
                    </CellSelect>
                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        className={cn(
                          'text-sm tabular-nums',
                          result.price?.source === 'invoice'
                            ? 'border-b-2 border-emerald-700'
                            : 'border-b border-dashed border-amber-700',
                        )}
                      >
                        {per
                          ? `₹${per.value < 10 ? per.value.toFixed(2) : Math.round(per.value)}/${per.unit}`
                          : '—'}
                      </span>
                      <PriceSourceChip
                        source={result.price?.source ?? 'none'}
                        small
                        label={result.price?.source === 'estimated' ? '≈ Estimated' : undefined}
                      />
                    </div>
                    <div className="text-right font-semibold tabular-nums">
                      {result.cost === null ? '—' : formatInr(result.cost, 2)}
                    </div>
                  </GridRow>
                );
              })}
              <div className="flex flex-wrap items-center gap-2.5 border-t border-border px-3.5 py-2.5">
                <button
                  type="button"
                  className={btn('default', 'sm')}
                  onClick={() =>
                    onChange({
                      lines: [
                        ...dish.lines,
                        { key: newKey(), ingredient: '', quantity: '', unit: 'G', edited: true },
                      ],
                    })
                  }
                >
                  <Plus aria-hidden />
                  Add ingredient
                </button>
                <span className="text-[12.5px] text-muted-foreground">
                  Change a quantity and the cost updates.
                </span>
              </div>
            </div>
            <datalist id={listId}>
              {ingredientNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-4 border-t border-border bg-muted p-4 md:grid-cols-4">
            <div>
              <Tag>Plate cost</Tag>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatInr(main.cost, 2)}
              </div>
              <div className="mt-1">
                {realLines > 0 ? (
                  <PriceSourceChip source="invoice" label="Partly from invoice" />
                ) : (
                  <PriceSourceChip source="estimated" />
                )}
              </div>
            </div>
            <div>
              <Tag>Selling price</Tag>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatInr(main.sellingPrice)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {costing.portions.length > 1 ? `${main.name} portion` : 'Menu price'}
              </div>
            </div>
            <div>
              <Tag>Food cost</Tag>
              <div className="mt-1 mb-2 flex items-center gap-2">
                <span className="text-lg font-semibold tabular-nums">
                  {main.foodCostPct === null ? '—' : `${Math.round(main.foodCostPct)}%`}
                </span>
                {main.band && <CostBandBadge band={main.band} />}
              </div>
              {main.foodCostPct !== null && (
                <CostMeter percent={main.foodCostPct} targetMax={target.max} />
              )}
            </div>
            <div>
              <Tag>Margin per plate</Tag>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {formatInr(Math.round(main.sellingPrice - main.cost))}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Target {target.min} – {target.max}%
              </div>
            </div>
            {costing.portions.length > 1 && (
              <p className="col-span-full text-xs text-muted-foreground">
                {costing.portions
                  .filter((portion) => portion !== main)
                  .map(
                    (portion) =>
                      `${portion.name}: ${formatInr(portion.cost, 2)} cost on ${formatInr(portion.sellingPrice)} (${portion.foodCostPct === null ? '—' : `${Math.round(portion.foodCostPct)}%`})`,
                  )
                  .join(' · ')}
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
