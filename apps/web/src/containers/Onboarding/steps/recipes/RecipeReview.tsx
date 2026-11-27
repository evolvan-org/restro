'use client';

import {
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
  DietMarker,
  EditedChip,
  LowConfidenceChip,
} from '@/components/AiScan/markers';

import { newKey } from '../../keys';
import {
  type IngredientUse,
  lineUnitConflicts,
  UNIT_BASE_LABELS,
  usedIngredients,
} from '../../recipe-ingredients';
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
} from '../../ui/kit';
import { dishNeedsAttention } from './recipe-drafts';

type Filter = 'attention' | 'all' | 'approved';
const UNITS = ['G', 'KG', 'ML', 'L', 'UNIT'] as const;
const LINE_COLS = '28px minmax(180px,1fr) 96px 80px';

/**
 * Split-view recipe review (board "Recipes: review"): dishes on the left, the recipe (ingredients,
 * quantity per plate, unit) on the right. A approves and moves on, E edits. No costs here: food
 * cost starts after setup, from real supplier invoices.
 */
export function RecipeReview({
  dishes,
  rows,
  portionStyle,
  onChange,
}: {
  dishes: readonly OnboardingRecipeDishDraft[];
  rows: ReadonlyMap<string, OnboardingMenuRow>;
  portionStyle: PortionStyle;
  onChange: (dishes: OnboardingRecipeDishDraft[]) => void;
}): ReactElement {
  const used = useMemo(() => usedIngredients(dishes), [dishes]);
  const ingredientNames = useMemo(() => [...used.values()].map((entry) => entry.name), [used]);
  const attention = dishes.filter((dish) => dishNeedsAttention(dish, used));
  const [filter, setFilter] = useState<Filter>(attention.length ? 'attention' : 'all');
  const listed = dishes.filter((dish) =>
    filter === 'attention'
      ? dishNeedsAttention(dish, used)
      : filter === 'approved'
        ? dish.status !== 'draft'
        : true,
  );
  const [selectedKey, setSelectedKey] = useState<string | undefined>(listed[0]?.menuRowKey);
  const selected = dishes.find((dish) => dish.menuRowKey === selectedKey) ?? listed[0] ?? dishes[0];
  const editorRef = useRef<HTMLDivElement>(null);
  const drafts = dishes.filter((dish) => dish.status === 'draft');
  // Drafts that need a look aren't approved in bulk: they're reviewed one by one.
  const ready = drafts.filter((dish) => dish.lines.length > 0 && !dishNeedsAttention(dish, used));
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
              const isSelected = dish.menuRowKey === selected?.menuRowKey;
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
                        ) : dishNeedsAttention(dish, used) ? (
                          <LowConfidenceChip label="Check" />
                        ) : (
                          <AiSuggestedChip label="Draft" />
                        )}
                      </span>
                    </span>
                    <span className="text-[12.5px] text-muted-foreground tabular-nums">
                      {dish.status === 'no-recipe' ? '' : `${dish.lines.length} items`}
                    </span>
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
              disabled={ready.length === 0}
              onClick={() =>
                onChange(
                  dishes.map((dish) =>
                    ready.includes(dish) ? { ...dish, status: 'approved' } : dish,
                  ),
                )
              }
            >
              <CircleCheck aria-hidden />
              {ready.length === drafts.length
                ? `Approve all ${drafts.length} drafts`
                : `Approve ${ready.length} ready drafts`}
            </button>
          </div>
        </Card>

        <div ref={editorRef} className="w-full min-w-0 flex-1">
          {selected ? (
            <DishEditor
              key={selected.menuRowKey}
              dish={selected}
              row={rows.get(selected.menuRowKey)}
              used={used}
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
  used,
  portionStyle,
  ingredientNames,
  onChange,
  onApprove,
}: {
  dish: OnboardingRecipeDishDraft;
  row: OnboardingMenuRow | undefined;
  used: ReadonlyMap<string, IngredientUse>;
  portionStyle: PortionStyle;
  ingredientNames: readonly string[];
  onChange: (patch: Partial<OnboardingRecipeDishDraft>) => void;
  onApprove: () => void;
}): ReactElement {
  const listId = `ingredients-${dish.menuRowKey}`;
  const noRecipe = dish.status === 'no-recipe';
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
            recipe.
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
                <span className="text-right">Qty per plate</span>
                <span>Unit</span>
              </GridHead>
              {dish.lines.map((line) => {
                const low = !line.edited && (line.confidence ?? 100) < 75;
                const expected = lineUnitConflicts(line, used);
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
                      {(low || line.edited || expected) && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {low && <LowConfidenceChip label="Check qty" small />}
                          {line.edited && <EditedChip label="Edited" small />}
                          {expected && (
                            <span className="text-[11.5px] text-red-700 dark:text-red-400">
                              Other recipes measure this in {UNIT_BASE_LABELS[expected]}
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
                  Quantities are per plate. Renaming here changes this dish only; rename everywhere
                  from the Ingredients tab.
                </span>
              </div>
            </div>
            <datalist id={listId}>
              {ingredientNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="h-4" />
        </>
      )}
    </Card>
  );
}
