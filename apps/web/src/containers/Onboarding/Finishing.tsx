'use client';

import {
  type CompleteOnboardingRequest,
  includedMenuRows,
  ONBOARDING_STAGE_STEP,
  type OnboardingStage,
  onboardingStageErrorSchema,
  type OnboardingStep,
  summarizeMenuCategories,
} from '@rms/api-contract';
import { cn } from 'cn';
import { ChevronRight, CircleCheck, Clock, RotateCw, Sparkles, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getApiErrorBody, getApiErrorCode, getApiErrorMessage } from '@/lib/api-error';
import { useCompleteOnboarding } from '@/services/api/requests/onboarding';

import { plural } from './format';
import { useOnboarding } from './OnboardingProvider';
import { TopBar } from './Shell';
import { stepMeta, stepPath } from './steps';
import { Alert, btn, Card, ProgressBar } from './ui/kit';
import { clearLocalDraft } from './useOnboardingDraft';

const STAGE_DWELL_MS = 650;
const FAST_DWELL_MS = 140;

type Stage = { id: OnboardingStage; label: string; detail: string };
type Failure = { stage: OnboardingStage; message: string };

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Finishing (board "Finishing: building"): one transaction, shown stage by stage. */
export default function Finishing(): ReactElement {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const { draft, server, setResult } = useOnboarding();
  const complete = useCompleteOnboarding();
  const [shown, setShown] = useState(0);
  const [succeeded, setSucceeded] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const started = useRef(false);

  const { data, skippedSteps } = draft;
  const skipped = useMemo(() => new Set(skippedSteps), [skippedSteps]);
  const { stages, skippedRows } = useMemo(() => {
    const sections = data.floor?.sections ?? [];
    const tables = sections.reduce((n, s) => n + s.tables.length, 0);
    const menuRows = data.menu?.mode === 'later' ? [] : includedMenuRows(data.menu?.rows ?? []);
    const menuKeys = new Set(menuRows.map((row) => row.key));
    const recipeCount = (data.recipes?.dishes ?? []).filter(
      (dish) =>
        menuKeys.has(dish.menuRowKey) && dish.status !== 'no-recipe' && dish.lines.length > 0,
    ).length;
    const inventoryRows = data.inventory?.rows ?? [];
    const opening = inventoryRows.filter((row) => row.openingQuantity.trim()).length;
    const members = (data.team?.members ?? []).filter((m) => m.name.trim() || m.email.trim());
    const list: (Stage | false)[] = [
      !skipped.has('details') &&
        !!data.details && {
          id: 'details',
          label: 'Restaurant details',
          detail: 'Saving address, GSTIN and GST rate',
        },
      !skipped.has('floor') &&
        sections.length > 0 && {
          id: 'floor',
          label: 'Floor & tables',
          detail: `${plural(sections.length, 'section')} · ${plural(tables, 'table')}`,
        },
      { id: 'statuses', label: 'Table statuses', detail: 'Statuses and bill cancellation reasons' },
      !skipped.has('menu') &&
        menuRows.length > 0 && {
          id: 'menu',
          label: 'Menu',
          detail: `${plural(menuRows.length, 'dish', 'dishes')} in ${plural(summarizeMenuCategories(menuRows).length, 'category', 'categories')}`,
        },
      !skipped.has('inventory') &&
        inventoryRows.length > 0 && {
          id: 'inventory',
          label: 'Inventory',
          detail: `${plural(inventoryRows.length, 'ingredient')} · ${plural(opening, 'opening stock batch', 'opening stock batches')}`,
        },
      // Recipes reference stock items, so they go in after inventory.
      !skipped.has('menu') &&
        !skipped.has('recipes') &&
        recipeCount > 0 && {
          id: 'recipes',
          label: 'Recipes',
          detail: `Linking ${plural(recipeCount, 'recipe')}`,
        },
      !skipped.has('team') &&
        members.length > 0 && {
          id: 'team',
          label: 'Team',
          detail: `Creating ${plural(members.length, 'account')}`,
        },
      { id: 'final', label: 'Final checks', detail: 'Opening your restaurant' },
    ];
    const running = list.filter((stage): stage is Stage => stage !== false);
    const ids = new Set(running.map((stage) => stage.id));
    const skippedSteps: OnboardingStep[] = (
      ['details', 'floor', 'menu', 'recipes', 'inventory', 'team'] as const
    ).filter((step) => !ids.has(step as OnboardingStage));
    return { stages: running, skippedRows: skippedSteps };
  }, [data, skipped]);

  const run = useCallback(() => {
    setFailure(null);
    setSucceeded(false);
    setShown(0);
    const request: CompleteOnboardingRequest = {
      skippedSteps: draft.skippedSteps,
      data: draft.data,
    };
    complete.mutate(request, {
      onSuccess: (result) => {
        setResult(result);
        clearLocalDraft(server.restaurantId);
        setSucceeded(true);
      },
      onError: (error) => {
        if (getApiErrorCode(error) === 'ONBOARDING_ALREADY_COMPLETED') {
          router.replace('/dashboard');
          return;
        }
        const body = getApiErrorBody(error, onboardingStageErrorSchema);
        setFailure({
          stage: body?.stage ?? 'final',
          message: getApiErrorMessage(error, 'Something went wrong. Nothing was created.'),
        });
      },
    });
  }, [complete, draft.data, draft.skippedSteps, router, server.restaurantId, setResult]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  // Stages tick on a timer, but the last one waits for the server; success finishes the rest.
  useEffect(() => {
    if (failure) return;
    const holdAt = stages.length - 1;
    if (!succeeded && shown >= holdAt) return;
    if (shown >= stages.length) return;
    if (reduced) {
      setShown(succeeded ? stages.length : holdAt);
      return;
    }
    const timer = window.setTimeout(
      () => setShown((n) => n + 1),
      succeeded ? FAST_DWELL_MS : STAGE_DWELL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [shown, succeeded, failure, stages.length, reduced]);

  useEffect(() => {
    if (!succeeded || shown < stages.length) return;
    const timer = window.setTimeout(() => router.replace('/onboarding/ready'), reduced ? 0 : 500);
    return () => window.clearTimeout(timer);
  }, [succeeded, shown, stages.length, reduced, router]);

  const failedIndex = failure
    ? Math.max(
        0,
        stages.findIndex((stage) => stage.id === failure.stage),
      )
    : -1;
  const percent = failure
    ? (failedIndex / stages.length) * 100
    : (Math.min(shown, stages.length) / stages.length) * 100;
  const fixStep: OnboardingStep | null = failure ? ONBOARDING_STAGE_STEP[failure.stage] : null;

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <TopBar
        savedLabel={failure ? 'Nothing was created' : succeeded ? 'All saved' : 'Building…'}
      />
      <main className="flex-1 overflow-auto bg-muted px-4">
        <div className="mx-auto mt-10 mb-10 flex w-full max-w-[640px] flex-col gap-5 text-center">
          <span
            className={cn(
              'mx-auto flex size-16 items-center justify-center rounded-full',
              failure
                ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
            )}
          >
            {failure ? (
              <TriangleAlert className="size-7" aria-hidden />
            ) : (
              <Sparkles className="size-7" aria-hidden />
            )}
          </span>
          <div>
            <h1 className="text-[30px] font-bold tracking-[-0.02em]">
              {failure ? 'Setup hit a problem' : 'Building your restaurant'}
            </h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">
              {failure
                ? 'Nothing was half-created. Fix it and try again.'
                : 'Creating everything you approved. Keep this tab open.'}
            </p>
          </div>
          <ProgressBar value={percent} label="Setup progress" className="h-2.5" />
          <Card className="overflow-hidden text-left">
            <ol aria-live="polite">
              {stages.map((stage, index) => {
                const isFailed = failure !== null && index === failedIndex;
                const isDone = !failure ? index < shown : index < failedIndex;
                const isRunning = !failure && index === shown && shown < stages.length;
                return (
                  <li
                    key={stage.id}
                    className={cn(
                      'flex min-h-[54px] items-center gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0',
                      isRunning && 'bg-muted shadow-[inset_3px_0_0_var(--primary)]',
                    )}
                  >
                    <span className="[&_svg]:size-5">
                      {isFailed ? (
                        <TriangleAlert className="text-red-700 dark:text-red-400" aria-hidden />
                      ) : isDone ? (
                        <CircleCheck
                          className="text-emerald-700 dark:text-emerald-400"
                          aria-hidden
                        />
                      ) : isRunning ? (
                        <RotateCw
                          className="animate-spin text-indigo-700 motion-reduce:animate-none dark:text-indigo-300"
                          aria-hidden
                        />
                      ) : (
                        <Clock className="text-muted-foreground" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          'font-semibold',
                          isFailed && 'text-red-700 dark:text-red-400',
                        )}
                      >
                        {stage.label}
                      </div>
                      <div className="text-[13px] text-muted-foreground">
                        {stage.detail}
                        <span className="sr-only">
                          {isFailed
                            ? ', failed'
                            : isDone
                              ? ', done'
                              : isRunning
                                ? ', in progress'
                                : ', waiting'}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
              {skippedRows.map((step) => (
                <li
                  key={step}
                  className="flex min-h-[54px] items-center gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0"
                >
                  <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                  <div>
                    <div className="font-semibold">{stepMeta(step).label}</div>
                    <div className="text-[13px] text-muted-foreground">Skipped</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          {failure && (
            <Alert
              tone="bad"
              role="alert"
              icon={<TriangleAlert aria-hidden />}
              className="text-left"
            >
              <p>{failure.message} Everything you entered is still saved.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btn('primary', 'sm')}
                  onClick={run}
                  disabled={complete.isPending}
                >
                  Try again
                </button>
                {fixStep && (
                  <button
                    type="button"
                    className={btn('default', 'sm')}
                    onClick={() => router.push(stepPath(fixStep))}
                  >
                    Fix in {stepMeta(fixStep).label}
                  </button>
                )}
              </div>
            </Alert>
          )}
        </div>
      </main>
    </div>
  );
}
