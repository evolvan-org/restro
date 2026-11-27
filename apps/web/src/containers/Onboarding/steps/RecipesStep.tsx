'use client';

import {
  findRecipeIssues,
  type OnboardingMenuRow,
  type OnboardingRecipesDraft,
  PORTION_STYLE_LABELS,
  type PortionStyle,
  recipeDraftSchema,
} from '@rms/api-contract';
import { cn } from 'cn';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleCheck,
  Eye,
  Info,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';

import { AiFailureState, FloatingAiProgress } from '@/components/AiScan/AiStates';
import { AiSuggestedChip } from '@/components/AiScan/markers';
import { isActiveJob, useAiJob } from '@/hooks/useAiJob';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api-error';
import { createRecipeDraft, useAiUsage } from '@/services/api/requests/ai';

import { useOnboarding } from '../OnboardingProvider';
import { recipeMenuRows, renameIngredient, usedIngredients } from '../recipe-ingredients';
import Shell from '../Shell';
import { stepPath } from '../steps';
import { Alert, btn, Card, Pills, ProgressBar, Seg, Tag } from '../ui/kit';
import { useStepNavigation } from '../useStepNavigation';
import { IngredientsTab } from './recipes/IngredientsTab';
import {
  DEFAULT_RECIPES,
  inventoryRowsFromRecipes,
  mergeRecipeItems,
} from './recipes/recipe-drafts';
import { RecipeReview } from './recipes/RecipeReview';

type Tab = 'dishes' | 'ingredients';
const STYLES = (['LIGHT', 'STANDARD', 'GENEROUS'] as const).map((value) => ({
  value,
  label: PORTION_STYLE_LABELS[value],
}));
const SUB = 'What goes into each dish. Stock is deducted by these recipes when orders are made.';

/**
 * Recipes (boards "Recipes: start / needs a menu / drafting live / review"): AI drafts the
 * ingredients and quantity per plate for every dish; the owner reviews them on one screen with two
 * tabs, Dishes and Ingredients (rename once, every recipe updates). No costs in onboarding: food
 * cost starts after setup, from real supplier invoices.
 */
export default function RecipesStep(): ReactElement {
  const router = useRouter();
  const { draft, setStepData } = useOnboarding();
  const nav = useStepNavigation('recipes');
  const ai = useAiUsage();
  const [tab, setTab] = useState<Tab>('dishes');
  const [reviewEarly, setReviewEarly] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);

  const recipes: OnboardingRecipesDraft = draft.data.recipes ?? DEFAULT_RECIPES;
  const save = (patch: Partial<OnboardingRecipesDraft>): void =>
    setStepData('recipes', { ...(draft.data.recipes ?? DEFAULT_RECIPES), ...patch });
  const menuRows = recipeMenuRows(draft.data, draft.skippedSteps.includes('menu'));
  const rows = useMemo(() => new Map(menuRows.map((row) => [row.key, row])), [menuRows]);
  // Only recipes for dishes still on the menu count: the menu may have been rescanned or edited
  // since drafting, leaving recipes for rows that no longer exist.
  const dishes = recipes.dishes.filter((dish) => rows.has(dish.menuRowKey));
  const withRecipe = new Set(recipes.dishes.map((dish) => dish.menuRowKey));
  const undrafted = menuRows.filter((row) => !withRecipe.has(row.key));
  const { job, items } = useAiJob(recipes.jobId);
  const active = isActiveJob(job);

  // Drafted dishes join the draft as they stream in.
  const latest = useRef({ recipes, setStepData });
  latest.current = { recipes, setStepData };
  useEffect(() => {
    const current = latest.current.recipes;
    const merged = mergeRecipeItems(current, items);
    if (merged) latest.current.setStepData('recipes', { ...current, dishes: merged });
  }, [items]);

  /** Drafts recipes for `forRows` (default: every dish without one), keeping the rest. */
  async function startDrafting(forRows: OnboardingMenuRow[] = undrafted): Promise<void> {
    setStarting(true);
    setStartError(undefined);
    try {
      const result = await createRecipeDraft({
        context: 'ONBOARDING',
        portionStyle: recipes.portionStyle,
        dishes: forRows.map((row) => ({
          ref: row.key,
          name: row.name.trim(),
          category: row.category.trim(),
          type: row.type.trim().toUpperCase() === 'BAR' ? 'BAR' : 'FOOD',
          dietType: row.dietType ?? null,
        })),
      });
      // Recipes for dishes no longer on the menu are dropped; the others are kept.
      save({ jobId: result.job.id, dishes });
      setReviewEarly(false);
      setTab('dishes');
    } catch (error) {
      if (getApiErrorCode(error) === 'AI_UNAVAILABLE') setUnavailable(true);
      else setStartError(getApiErrorMessage(error, "We couldn't start drafting. Try again."));
    } finally {
      setStarting(false);
    }
  }

  const issues = findRecipeIssues({ dishes });
  const ingredientCount = useMemo(() => usedIngredients(dishes).size, [dishes]);

  async function continueToInventory(): Promise<void> {
    // Recipes of dishes no longer on the menu are dropped, so their ingredients don't reach stock.
    const current: OnboardingRecipesDraft = { ...recipes, dishes };
    setStepData('recipes', current);
    const inventoryRows = inventoryRowsFromRecipes({ ...draft.data, recipes: current });
    if (inventoryRows.length !== (draft.data.inventory?.rows.length ?? 0)) {
      setStepData('inventory', { ...(draft.data.inventory ?? { rows: [] }), rows: inventoryRows });
    }
    await nav.next();
  }

  // ---- Needs a menu ----
  if (menuRows.length === 0) {
    return (
      <Shell
        step="recipes"
        title="Recipes"
        description="Recipes are drafted from your menu."
        width="wide"
        footer={{
          onBack: nav.back,
          onSkip: () => void nav.skip(),
          primary: (
            <button type="button" className={btn('primary')} onClick={() => void nav.skip()}>
              Skip and continue
              <ArrowRight aria-hidden />
            </button>
          ),
        }}
      >
        <Card className="mx-auto mt-5 flex w-full max-w-[640px] flex-col items-center gap-3.5 p-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-[14px] border border-border bg-muted">
            <BookOpen className="size-[26px]" aria-hidden />
          </span>
          <h2 className="text-[22px] font-semibold tracking-[-0.01em]">Add a menu first</h2>
          <p className="text-[15px] text-muted-foreground">
            We need your dishes to draft recipes. The Menu step is empty or was skipped.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              className={btn('primary')}
              onClick={() => router.push(stepPath('menu'))}
            >
              <ArrowLeft aria-hidden />
              Back to Menu
            </button>
            <button type="button" className={btn()} onClick={() => void nav.skip()}>
              Skip recipes for now
            </button>
          </div>
          <p className="text-[13px] text-muted-foreground">
            You can draft recipes any time from the dashboard after setup.
          </p>
        </Card>
      </Shell>
    );
  }

  // ---- Start ---- (also when no recipe matches the current menu, e.g. after a rescan)
  if (!active && dishes.length === 0) {
    const off = unavailable || ai.data?.enabled === false;
    return (
      <Shell
        step="recipes"
        title="Recipes"
        description={SUB}
        width="wide"
        footer={{
          onBack: nav.back,
          onSkip: () => void nav.skip(),
          primary: off ? undefined : (
            <button
              type="button"
              className={btn('ai')}
              disabled={starting}
              onClick={() => void startDrafting(menuRows)}
            >
              <Sparkles aria-hidden />
              {starting ? 'Starting…' : `Draft ${menuRows.length} recipes`}
            </button>
          ),
        }}
      >
        {off ? (
          <AiFailureState
            kind="AI_UNAVAILABLE"
            noun="recipes"
            actions={
              <button
                type="button"
                className={btn('default', 'sm')}
                onClick={() => void nav.skip()}
              >
                Skip and add recipes after setup
              </button>
            }
          />
        ) : (
          <div className="flex flex-col items-start gap-6 lg:flex-row">
            <Card className="flex w-full flex-none flex-col gap-[22px] p-7 lg:w-[560px]">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4" aria-hidden />
                  <Tag>AI draft</Tag>
                </div>
                <h2 className="mt-2 text-[26px] leading-tight font-bold tracking-[-0.02em]">
                  Draft recipes for all {menuRows.length} dishes?
                </h2>
                <p className="mt-1.5 text-[15px] text-muted-foreground">
                  We&apos;ll suggest the ingredients and quantity per plate for every dish. You
                  review and rename anything before it&apos;s saved.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold">Portion style</span>
                <Seg
                  label="Portion style"
                  options={STYLES}
                  value={recipes.portionStyle}
                  onChange={(portionStyle: PortionStyle) => save({ portionStyle })}
                  fill
                />
              </div>
              {startError && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                  {startError}
                </p>
              )}
              <div>
                <button
                  type="button"
                  className={btn('ai', 'lg')}
                  disabled={starting}
                  onClick={() => void startDrafting(menuRows)}
                >
                  <Sparkles aria-hidden />
                  {starting ? 'Starting…' : `Draft ${menuRows.length} recipes`}
                </button>
              </div>
            </Card>
            <div className="flex w-full min-w-0 flex-1 flex-col gap-2.5">
              <Alert icon={<Info aria-hidden />}>
                Recipes deduct stock as orders are made, so your stock levels stay right.
              </Alert>
              <Alert icon={<Info aria-hidden />}>
                Bought-in items like bottled drinks are marked <b>No recipe needed</b>.
              </Alert>
            </div>
          </div>
        )}
      </Shell>
    );
  }

  const total = menuRows.length;
  const drafted = dishes.length;
  const floating = active ? (
    <FloatingAiProgress label={`Drafting recipes · ${drafted} of ${total}`} />
  ) : undefined;

  // ---- Drafting live ----
  if (active && !reviewEarly) {
    const recent = items
      .slice(-8)
      .flatMap((item) => {
        const parsed = recipeDraftSchema.safeParse(item.data);
        return parsed.success ? [parsed.data] : [];
      })
      .reverse();
    const elapsed = job ? (Date.now() - Date.parse(job.createdAt)) / 1000 : 0;
    const left =
      drafted > 0 ? Math.max(1, Math.round((elapsed / drafted) * (total - drafted))) : null;
    return (
      <Shell
        step="recipes"
        title="Recipes"
        description="Recipe cards fill in live. You don't have to wait."
        width="wide"
        floating={floating}
        footer={{
          note: 'Drafts are saved as they arrive.',
          primary: (
            <button type="button" className={btn('primary')} disabled>
              Save and continue
              <ArrowRight aria-hidden />
            </button>
          ),
        }}
      >
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span
                className="text-lg font-semibold tracking-[-0.01em] tabular-nums"
                aria-live="polite"
              >
                Drafting recipes · {drafted} of {total} dishes
              </span>
              <div className="mt-0.5 text-[13px] text-muted-foreground">
                {left === null
                  ? 'Starting…'
                  : `About ${left} seconds left. Dishes that are ready can be reviewed now.`}
              </div>
            </div>
            <button
              type="button"
              className={btn('ai', 'sm')}
              disabled={drafted === 0}
              onClick={() => setReviewEarly(true)}
            >
              <Eye aria-hidden />
              Review the ready ones
            </button>
          </div>
          <ProgressBar
            className="mt-3"
            tone="ai"
            label="Recipes drafted"
            value={total ? (drafted / total) * 100 : 0}
          />
        </Card>
        <div className="flex flex-col items-start gap-4 lg:flex-row">
          <Card className="w-full flex-none overflow-hidden lg:w-[340px]">
            <div className="flex min-h-12 items-center border-b border-border px-3.5">
              <span className="text-sm font-semibold">Dishes</span>
              <span className="flex-1" />
              <span className="text-[13px] text-muted-foreground tabular-nums">
                {drafted} of {total}
              </span>
            </div>
            <ol className="max-h-[520px] overflow-hidden">
              <li className="flex min-h-14 items-center gap-2.5 border-b border-border bg-muted px-3.5 shadow-[inset_3px_0_0_var(--primary)]">
                <Sparkles className="size-4 text-indigo-700 dark:text-indigo-300" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {menuRows[Math.min(drafted, menuRows.length - 1)]?.name ?? 'Next dish'}
                  </div>
                  <div className="text-[12.5px] text-muted-foreground">Drafting now…</div>
                </div>
              </li>
              {recent.map((entry) => (
                <li
                  key={entry.dishRef}
                  className="flex min-h-14 items-center gap-2.5 border-b border-border px-3.5 last:border-b-0"
                >
                  <CircleCheck
                    className="size-4 text-emerald-700 dark:text-emerald-400"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{entry.dishName}</div>
                    <div className="text-[12.5px] text-muted-foreground">
                      Drafted · open to review
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          <div className="grid w-full min-w-0 flex-1 grid-cols-1 gap-3.5 md:grid-cols-3">
            {recent.slice(0, 3).map((entry, index) => (
              <Card
                key={entry.dishRef}
                className={cn(
                  'p-3.5',
                  index === 0 &&
                    'border-indigo-600 shadow-[0_0_0_3px_#eef2ff] dark:shadow-[0_0_0_3px_#1b1a40]',
                )}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <b className="min-w-0 flex-1 truncate">{entry.dishName}</b>
                  <AiSuggestedChip label={index === 0 ? 'Just drafted' : 'Draft'} />
                </div>
                {entry.noRecipeNeeded ? (
                  <p className="py-1.5 text-[13px] text-muted-foreground">No recipe needed</p>
                ) : (
                  entry.lines.slice(0, 5).map((line) => (
                    <div
                      key={line.ingredient}
                      className="flex justify-between gap-2 border-b border-border py-1.5 text-sm last:border-b-0"
                    >
                      <span className="truncate">{line.ingredient}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {line.quantity} {line.unit.toLowerCase()}
                      </span>
                    </div>
                  ))
                )}
              </Card>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  const failedNote =
    job && !active && job.errorCode === 'AI_UNAVAILABLE' ? (
      <Alert tone="warn" icon={<TriangleAlert aria-hidden />}>
        <b>AI stopped partway.</b> Dishes it didn&apos;t reach have no recipe yet; add their
        ingredients by hand, or skip them.
      </Alert>
    ) : null;
  const blocked = issues.length > 0;
  const blockedHint = issues.length
    ? `${issues.length} recipe line${issues.length === 1 ? ' needs' : 's need'} fixing: ${issues[0]?.message}.`
    : undefined;

  // ---- Review ----
  return (
    <Shell
      step="recipes"
      title="Review recipes"
      description="These are drafts. Check the ingredients and quantities, then approve."
      headerRight={<AiSuggestedChip label="All AI-suggested" />}
      width="wide"
      floating={floating}
      complete={!blocked}
      hint={blockedHint}
      footer={{
        onBack: nav.back,
        onSkip: () => void nav.skip(),
        note: active ? 'Still drafting; new dishes join the list.' : undefined,
        primary: (
          <button
            type="button"
            className={btn('primary')}
            disabled={blocked || nav.busy}
            onClick={() => void continueToInventory()}
          >
            Save and continue
            <ArrowRight aria-hidden />
          </button>
        ),
      }}
    >
      {failedNote}
      {!active && undrafted.length > 0 && (
        <Alert tone="ai" icon={<Sparkles aria-hidden />} role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <b>
                {undrafted.length} {undrafted.length === 1 ? 'dish has' : 'dishes have'} no recipe
                yet
              </b>{' '}
              (added to the menu after drafting). Your reviewed recipes stay as they are.
            </span>
            <button
              type="button"
              className={btn('ai', 'sm')}
              disabled={starting}
              onClick={() => void startDrafting()}
            >
              <Sparkles aria-hidden />
              {starting ? 'Starting…' : `Draft ${undrafted.length === 1 ? 'it' : 'them'}`}
            </button>
          </div>
          {startError && (
            <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">
              {startError}
            </p>
          )}
        </Alert>
      )}
      <Pills
        label="Recipes view"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'dishes', label: `Dishes · ${dishes.length}` },
          { value: 'ingredients', label: `Ingredients · ${ingredientCount}` },
        ]}
      />
      {tab === 'dishes' ? (
        <RecipeReview
          dishes={dishes}
          rows={rows}
          portionStyle={recipes.portionStyle}
          onChange={(next) =>
            save({
              dishes: [...recipes.dishes.filter((dish) => !rows.has(dish.menuRowKey)), ...next],
            })
          }
        />
      ) : (
        <IngredientsTab
          dishes={dishes}
          rows={rows}
          dismissedMerges={recipes.dismissedMerges ?? []}
          onRename={(fromKey, toName) =>
            save({
              dishes: [
                ...recipes.dishes.filter((dish) => !rows.has(dish.menuRowKey)),
                ...renameIngredient(dishes, fromKey, toName),
              ],
            })
          }
          onDismissMerge={(pair) =>
            save({ dismissedMerges: [...(recipes.dismissedMerges ?? []), pair] })
          }
        />
      )}
      {dishes.length > 0 && tab === 'dishes' && (
        <p className="text-[13px] text-muted-foreground">
          Unapproved drafts are still saved, marked &quot;AI draft, not yet reviewed&quot;.
        </p>
      )}
    </Shell>
  );
}
