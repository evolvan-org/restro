'use client';

import {
  type CompleteOnboardingRequest,
  ONBOARDING_STAGE_STEP,
  type OnboardingStage,
  onboardingStageErrorSchema,
  type OnboardingStep,
  summarizeMenuCategories,
} from '@rms/api-contract';
import { Check, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getApiErrorBody, getApiErrorCode, getApiErrorMessage } from '@/lib/api-error';
import { useCompleteOnboarding } from '@/services/api/requests/onboarding';

import { plural } from './format';
import { useOnboarding } from './OnboardingProvider';
import { stepPath } from './steps';
import { clearLocalDraft } from './useOnboardingDraft';

const STAGE_DWELL_MS = 500;
const FAST_DWELL_MS = 120;

type Stage = { id: OnboardingStage; label: string };

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
  const stages = useMemo<Stage[]>(() => {
    const sections = data.floor?.sections ?? [];
    const tables = sections.reduce((n, s) => n + s.tables.length, 0);
    const menuRows = data.menu?.mode === 'later' ? [] : (data.menu?.rows ?? []);
    const inventoryRows = data.inventory?.rows ?? [];
    const members = (data.team?.members ?? []).filter((m) => m.name.trim() || m.email.trim());
    const list: (Stage | false)[] = [
      !skipped.has('details') &&
        !!data.details && {
          id: 'details',
          label: 'Saving restaurant details',
        },
      !skipped.has('floor') &&
        sections.length > 0 && {
          id: 'floor',
          label: `Laying out ${plural(sections.length, 'section')} and ${plural(tables, 'table')}`,
        },
      { id: 'statuses', label: 'Adding table statuses and cancellation reasons' },
      !skipped.has('menu') &&
        menuRows.length > 0 && {
          id: 'menu',
          label: `Importing ${plural(menuRows.length, 'menu item')} in ${plural(
            summarizeMenuCategories(menuRows).length,
            'category',
            'categories',
          )}`,
        },
      !skipped.has('inventory') &&
        inventoryRows.length > 0 && {
          id: 'inventory',
          label: `Importing ${plural(inventoryRows.length, 'ingredient')} and opening stock`,
        },
      !skipped.has('team') &&
        members.length > 0 && {
          id: 'team',
          label: `Creating ${plural(members.length, 'team account')}`,
        },
      { id: 'final', label: 'Final checks' },
    ];
    return list.filter((stage): stage is Stage => stage !== false);
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

  // Fire the request immediately, exactly once (StrictMode runs effects twice in development).
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
    const timer = window.setTimeout(() => router.replace('/onboarding/ready'), reduced ? 0 : 700);
    return () => window.clearTimeout(timer);
  }, [succeeded, shown, stages.length, reduced, router]);

  const failedIndex = failure
    ? Math.max(
        0,
        stages.findIndex((stage) => stage.id === failure.stage),
      )
    : -1;
  const percent = failure
    ? Math.round((failedIndex / stages.length) * 100)
    : Math.round((Math.min(shown, stages.length) / stages.length) * 100);
  const statusesDone = shown > stages.findIndex((s) => s.id === 'statuses');
  const fixStep: OnboardingStep | null = failure ? ONBOARDING_STAGE_STEP[failure.stage] : null;
  const sections = data.floor?.sections ?? [];
  const name = data.details?.name.trim() || server.restaurant.name;

  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-950 px-4 py-10 text-white">
      <style>{`
        @keyframes onb-pop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
        .onb-tile { animation: onb-pop .3s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .onb-tile { animation: none; } .onb-ring { transition: none !important; } }
      `}</style>
      <div className="grid w-full max-w-4xl gap-10 md:grid-cols-[1fr_1fr] md:items-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative size-40">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
              <circle cx="60" cy="60" r="52" fill="none" stroke="#262626" strokeWidth="8" />
              <circle
                className="onb-ring"
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke={failure ? '#f87171' : '#34d399'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 52}
                strokeDashoffset={2 * Math.PI * 52 * (1 - percent / 100)}
                style={{ transition: 'stroke-dashoffset .4s ease' }}
              />
            </svg>
            <span
              className="absolute inset-0 flex items-center justify-center text-3xl font-bold tabular-nums"
              role="progressbar"
              aria-label="Setup progress"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              {percent}%
            </span>
          </div>
          <h1 className="text-center text-2xl font-bold">
            {failure ? 'Setup hit a problem' : `Building ${name}`}
          </h1>
          <div className="flex max-w-sm flex-wrap justify-center gap-4">
            {sections.map((section, sectionIndex) => (
              <div key={section.key} className="flex flex-col items-center gap-1.5">
                <span className="text-[11px] text-neutral-400">{section.name || 'Section'}</span>
                <div className="flex max-w-40 flex-wrap justify-center gap-1">
                  {section.tables.slice(0, 12).map((table, i) => (
                    <span
                      key={table.key}
                      className={`onb-tile size-5 rounded ${statusesDone && !failure ? 'bg-emerald-500' : 'bg-neutral-700'}`}
                      style={{
                        animationDelay: reduced ? '0s' : `${(sectionIndex * 4 + i) * 60}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <ol className="flex flex-col gap-3" aria-live="polite">
            {stages.map((stage, index) => {
              const isFailed = failure !== null && index === failedIndex;
              const isDone = !failure ? index < shown : index < failedIndex;
              const isRunning = !failure && index === shown && shown < stages.length;
              return (
                <li key={stage.id} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex size-6 flex-none items-center justify-center rounded-full text-xs font-bold ${
                      isFailed
                        ? 'bg-red-500 text-white'
                        : isDone
                          ? 'bg-emerald-500 text-neutral-950'
                          : isRunning
                            ? 'border-2 border-white'
                            : 'border border-neutral-600'
                    }`}
                  >
                    {isFailed ? (
                      '!'
                    ) : isDone ? (
                      <Check className="size-3.5" strokeWidth={3} />
                    ) : null}
                  </span>
                  <span
                    className={
                      isFailed
                        ? 'font-semibold text-red-300'
                        : isDone || isRunning
                          ? ''
                          : 'text-neutral-500'
                    }
                  >
                    {stage.label}
                    <span className="sr-only">
                      {isFailed ? ' failed' : isDone ? ' done' : isRunning ? ' in progress' : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>

          {failure && (
            <div className="flex flex-col gap-4 rounded-xl border border-red-400/40 bg-red-950/40 p-4">
              <p className="flex items-start gap-2 text-sm text-red-100" role="alert">
                <TriangleAlert className="mt-0.5 size-4 flex-none" aria-hidden />
                {failure.message} Everything you entered is still saved.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="h-11 bg-white text-neutral-900 hover:bg-neutral-100"
                  onClick={run}
                  disabled={complete.isPending}
                >
                  Try again
                </Button>
                {fixStep && (
                  <Button
                    variant="outline"
                    className="h-11 border-neutral-500 bg-transparent text-white hover:bg-neutral-800 hover:text-white"
                    onClick={() => router.push(stepPath(fixStep))}
                  >
                    Fix in {fixStep === 'floor' ? 'Floor & tables' : fixStep}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
