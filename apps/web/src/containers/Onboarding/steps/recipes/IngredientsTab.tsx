'use client';

import {
  type OnboardingMenuRow,
  type OnboardingRecipeDishDraft,
  suggestMerges,
} from '@rms/api-contract';
import { Merge, Pencil } from 'lucide-react';
import { type KeyboardEvent, type ReactElement, useState } from 'react';

import {
  ingredientKey,
  type IngredientUse,
  UNIT_BASE_LABELS,
  type UnitBase,
  usedIngredients,
} from '../../recipe-ingredients';
import { Alert, btn, Card, CellInput, GridHead, GridRow, GridTable } from '../../ui/kit';

const COLS = 'minmax(220px,1fr) 170px 150px';

/**
 * Ingredients tab of the Recipes step: every ingredient the recipes use, once. Renaming one here
 * renames it in every recipe ("Hung Curd" → "Dahi"); renaming to a name already in use offers to
 * combine the two. These become the stock items in the Inventory step.
 */
export function IngredientsTab({
  dishes,
  rows,
  dismissedMerges,
  onRename,
  onDismissMerge,
}: {
  dishes: readonly OnboardingRecipeDishDraft[];
  rows: ReadonlyMap<string, OnboardingMenuRow>;
  dismissedMerges: readonly string[];
  /** Renames `fromKey` to `toName` in every recipe (a merge when `toName` is already used). */
  onRename: (fromKey: string, toName: string) => void;
  onDismissMerge: (pair: string) => void;
}): ReactElement {
  const used = usedIngredients(dishes);
  const entries = [...used.entries()].sort(
    (a, b) => b[1].dishKeys.length - a[1].dishKeys.length || a[1].name.localeCompare(b[1].name),
  );
  const dismissed = new Set(dismissedMerges);
  const merges = suggestMerges(entries.map(([key, entry]) => ({ key, name: entry.name }))).filter(
    (merge) => !dismissed.has(`${merge.keep}|${merge.merge}`),
  );
  const recipeCount = dishes.filter(
    (dish) => dish.status !== 'no-recipe' && dish.lines.length,
  ).length;

  if (!entries.length) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Ingredients appear here once recipes are drafted.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-lg font-semibold tracking-[-0.01em]">
          {entries.length} ingredients across {recipeCount} recipes
        </span>
        <span className="text-[13px] text-muted-foreground">
          Use the names your kitchen uses. Renaming one updates every recipe.
        </span>
      </div>

      {merges.length > 0 && (
        <Alert tone="warn" icon={<Merge aria-hidden />}>
          <div className="flex flex-col gap-2">
            {merges.map((merge) => {
              const keep = used.get(merge.keep)?.name ?? merge.keep;
              const other = used.get(merge.merge)?.name ?? merge.merge;
              const pair = `${merge.keep}|${merge.merge}`;
              return (
                <div key={pair} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span>
                    <b>{keep}</b> and <b>{other}</b> look like the same ingredient.
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className={btn('default', 'sm')}
                      onClick={() => onRename(merge.merge, keep)}
                    >
                      Combine as &quot;{keep}&quot;
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-muted-foreground hover:underline"
                      onClick={() => onDismissMerge(pair)}
                    >
                      Keep both
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </Alert>
      )}

      <GridTable label="Ingredients">
        <GridHead cols={COLS}>
          <span>Ingredient</span>
          <span>Used in</span>
          <span>Measured in</span>
        </GridHead>
        {entries.map(([key, entry]) => (
          <IngredientRow
            key={key}
            ingredientKey={key}
            entry={entry}
            used={used}
            rows={rows}
            onRename={onRename}
          />
        ))}
      </GridTable>
      <p className="text-[13px] text-muted-foreground">
        These become your stock items in the next step, where you can add opening stock.
      </p>
    </div>
  );
}

function IngredientRow({
  ingredientKey: key,
  entry,
  used,
  rows,
  onRename,
}: {
  ingredientKey: string;
  entry: IngredientUse;
  used: ReadonlyMap<string, IngredientUse>;
  rows: ReadonlyMap<string, OnboardingMenuRow>;
  onRename: (fromKey: string, toName: string) => void;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entry.name);
  /** Set when the new name is already used: combining needs a yes. */
  const [clash, setClash] = useState<IngredientUse | null>(null);
  const [showDishes, setShowDishes] = useState(false);
  const count = entry.dishKeys.length;
  const families = Object.entries(entry.bases) as [UnitBase, number][];

  function cancel(): void {
    setEditing(false);
    setValue(entry.name);
    setClash(null);
  }

  function save(): void {
    const name = value.trim();
    const toKey = ingredientKey(name);
    if (!name || name === entry.name) return cancel();
    const existing = toKey === key ? undefined : used.get(toKey);
    if (existing) {
      setClash(existing);
      return;
    }
    onRename(key, name);
    setEditing(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  }

  return (
    <GridRow cols={COLS} tone={clash ? 'problem' : 'default'} className="min-h-[52px]">
      <div className="min-w-0">
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <CellInput
                autoFocus
                aria-label={`New name for ${entry.name}`}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setClash(null);
                }}
                onKeyDown={onKeyDown}
                className="max-w-[260px] font-medium"
              />
              {!clash && (
                <>
                  <button type="button" className={btn('primary', 'sm')} onClick={save}>
                    Rename
                  </button>
                  <button type="button" className={btn('default', 'sm')} onClick={cancel}>
                    Cancel
                  </button>
                </>
              )}
            </div>
            {clash && (
              <div className="flex flex-wrap items-center gap-2 text-[13px]" role="alert">
                <span>
                  <b>{clash.name}</b> is already used in {clash.dishKeys.length}{' '}
                  {clash.dishKeys.length === 1 ? 'dish' : 'dishes'}. Combine them into one
                  ingredient?
                </span>
                <button
                  type="button"
                  className={btn('primary', 'sm')}
                  onClick={() => {
                    onRename(key, clash.name);
                    setEditing(false);
                    setClash(null);
                  }}
                >
                  Combine
                </button>
                <button type="button" className={btn('default', 'sm')} onClick={cancel}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setValue(entry.name);
              setEditing(true);
            }}
            aria-label={`Rename ${entry.name}`}
            className="group inline-flex max-w-full items-center gap-2 rounded px-1 py-0.5 text-left font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            <span className="truncate">{entry.name}</span>
            <Pencil
              className="size-3.5 flex-none text-muted-foreground opacity-50 group-hover:opacity-100 group-focus-visible:opacity-100"
              aria-hidden
            />
          </button>
        )}
      </div>
      <div className="min-w-0 text-sm">
        <button
          type="button"
          aria-expanded={showDishes}
          onClick={() => setShowDishes((open) => !open)}
          className="text-muted-foreground tabular-nums hover:text-foreground hover:underline"
        >
          {count} {count === 1 ? 'dish' : 'dishes'}
        </button>
        {showDishes && (
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {entry.dishKeys.map((dishKey) => rows.get(dishKey)?.name ?? 'Dish').join(', ')}
          </p>
        )}
      </div>
      <div className="text-sm">
        {entry.base ? UNIT_BASE_LABELS[entry.base] : '—'}
        {families.length > 1 && (
          <span className="mt-0.5 block text-[12px] text-red-700 dark:text-red-400">
            {families
              .filter(([base]) => base !== entry.base)
              .map(([base, dishes]) => `${dishes} in ${UNIT_BASE_LABELS[base]}`)
              .join(', ')}
            ; fix in Dishes
          </span>
        )}
      </div>
    </GridRow>
  );
}
