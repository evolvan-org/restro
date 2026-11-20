'use client';

import type { OnboardingStep } from '@rms/api-contract';
import { Check, ListChecks, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactElement, type ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useLogout } from '@/store/hooks/auth';

import { savedAgo } from './format';
import { useOnboarding } from './OnboardingProvider';
import { canOpenStep, setupProgress, stepStatus } from './progress';
import { stepMeta, stepPath, STEPS } from './steps';

function SaveIndicator(): ReactElement {
  const { saveStatus, lastSavedAt } = useOnboarding();
  const label =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'offline'
        ? 'Offline · saved on this device'
        : saveStatus === 'error'
          ? "Couldn't save · kept on this device"
          : lastSavedAt
            ? `All changes saved · ${savedAgo(lastSavedAt)}`
            : 'Progress saves as you go';
  const dot =
    saveStatus === 'saved'
      ? 'bg-emerald-600'
      : saveStatus === 'saving'
        ? 'bg-neutral-400'
        : 'bg-amber-500';
  return (
    <p className="flex items-center gap-2 text-xs text-neutral-700" aria-live="polite">
      <span className={`size-2 flex-none rounded-full ${dot}`} aria-hidden />
      {label}
    </p>
  );
}

function StepList({
  current,
  onNavigate,
}: {
  current: OnboardingStep;
  onNavigate?: () => void;
}): ReactElement {
  const { draft } = useOnboarding();
  return (
    <ol className="flex flex-col gap-0.5">
      {STEPS.map((meta) => {
        const isCurrent = meta.step === current;
        const status = stepStatus(draft, meta.step);
        const tag = isCurrent
          ? 'In progress'
          : status === 'done'
            ? 'Done'
            : status === 'skipped'
              ? 'Skipped · finish later'
              : meta.tag;
        const tagColor = isCurrent
          ? 'text-neutral-900'
          : status === 'done'
            ? 'text-emerald-700'
            : status === 'skipped'
              ? 'text-amber-800'
              : 'text-neutral-600';
        const dot = isCurrent
          ? 'bg-neutral-900 text-white'
          : status === 'done'
            ? 'bg-emerald-600 text-white'
            : status === 'skipped'
              ? 'border-[1.5px] border-dashed border-neutral-400 bg-white text-neutral-600'
              : 'border-[1.5px] border-neutral-300 bg-white text-neutral-600';
        if (!canOpenStep(draft, meta.step)) {
          return (
            <li key={meta.step}>
              <div
                aria-disabled="true"
                title="Finish the earlier steps first"
                className="flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2.5 text-neutral-400"
              >
                <span className="flex size-7 flex-none items-center justify-center rounded-full border-[1.5px] border-neutral-200 bg-white text-[13px] font-semibold">
                  {meta.number}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="text-xs">Locked · finish earlier steps</span>
                </span>
                <Lock className="size-3.5 flex-none" aria-hidden />
              </div>
            </li>
          );
        }
        return (
          <li key={meta.step}>
            <Link
              href={stepPath(meta.step)}
              onClick={onNavigate}
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2.5 text-neutral-900 transition-colors hover:bg-neutral-50 ${isCurrent ? 'bg-neutral-100 hover:bg-neutral-100' : ''}`}
            >
              <span
                className={`flex size-7 flex-none items-center justify-center rounded-full text-[13px] font-semibold ${dot}`}
              >
                {status === 'done' && !isCurrent ? (
                  <Check className="size-3.5" strokeWidth={3} aria-label="Done" />
                ) : (
                  meta.number
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={`text-sm ${isCurrent ? 'font-semibold' : 'font-medium'}`}>
                  {meta.label}
                </span>
                <span className={`text-xs ${tagColor}`}>{tag}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function useSaveAndExit(): { exit: () => Promise<void>; exiting: boolean } {
  const { flush } = useOnboarding();
  const logout = useLogout();
  const router = useRouter();
  const [exiting, setExiting] = useState(false);
  return {
    exiting,
    exit: async () => {
      setExiting(true);
      await flush();
      logout();
      router.replace('/auth/login');
    },
  };
}

export type ShellFooter = {
  onBack?: () => void;
  onSkip?: () => void;
  /** Extra action placed before the primary one (e.g. "Import 40, leave out 2"). */
  secondary?: ReactNode;
  primary?: ReactNode;
};

/**
 * The frame around steps 1–6: stepper on the left (a top bar with a sheet below 1024px), the
 * step's content, and the Back · Skip for now · Save and continue footer.
 */
export default function Shell({
  step,
  title,
  description,
  footer,
  complete = true,
  hint,
  children,
}: {
  step: OnboardingStep;
  title: string;
  description: string;
  footer: ShellFooter;
  /**
   * False while a recommended step's form isn't fully filled in: Save and exit stays off (the
   * step's own Save and continue is disabled by the step).
   */
  complete?: boolean;
  /** What is still missing, shown above the footer while `complete` is false. */
  hint?: string;
  children: ReactNode;
}): ReactElement {
  const { draft, server } = useOnboarding();
  const { settled, percent } = setupProgress(draft);
  const { exit, exiting } = useSaveAndExit();
  const [sheetOpen, setSheetOpen] = useState(false);
  const meta = stepMeta(step);
  const restaurantName = draft.data.details?.name.trim() || server.restaurant.name;

  return (
    <div className="flex min-h-svh flex-col bg-neutral-50 text-neutral-900 lg:flex-row">
      <aside className="hidden w-[280px] flex-none flex-col gap-7 border-r border-neutral-200 bg-white px-5 py-7 lg:sticky lg:top-0 lg:flex lg:h-svh">
        <div className="flex items-center gap-3">
          <span className="flex size-9 flex-none items-center justify-center rounded-[9px] bg-neutral-900 font-bold text-white">
            R
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold">{restaurantName}</span>
            <span className="text-xs text-neutral-600">Restaurant setup</span>
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs text-neutral-600">
            <span>{settled} of 6 steps done</span>
            <span>{percent}%</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-neutral-100"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-neutral-900" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <nav aria-label="Setup steps" className="flex-1 overflow-y-auto">
          <StepList current={step} />
        </nav>
        <div className="flex flex-col gap-3 border-t border-neutral-100 pt-4">
          <SaveIndicator />
          <button
            type="button"
            onClick={() => void exit()}
            disabled={exiting || !complete}
            title={complete ? undefined : 'Fill in this step to save and exit'}
            className="inline-flex min-h-11 items-center self-start text-[13px] font-semibold hover:underline disabled:no-underline disabled:opacity-50"
          >
            {exiting ? 'Saving…' : 'Save and exit'}
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-semibold">
            Step {meta.number} of 6 · {meta.label}
          </span>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => setSheetOpen(true)}
            aria-label="All setup steps"
          >
            <ListChecks aria-hidden />
            Steps
          </Button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
          <div className="h-full rounded-full bg-neutral-900" style={{ width: `${percent}%` }} />
        </div>
      </header>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="gap-5 p-5">
          <SheetHeader className="p-0">
            <SheetTitle>
              {restaurantName} · {settled} of 6 done
            </SheetTitle>
          </SheetHeader>
          <nav aria-label="Setup steps">
            <StepList current={step} onNavigate={() => setSheetOpen(false)} />
          </nav>
          <div className="mt-auto flex flex-col gap-3">
            <SaveIndicator />
            <Button
              variant="outline"
              className="h-11"
              onClick={() => void exit()}
              disabled={exiting || !complete}
            >
              Save and exit
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 justify-center px-4 py-8 sm:px-8 lg:py-10">
        <div className="flex w-full max-w-[820px] flex-col gap-6">
          <header className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-neutral-600">
              Step {meta.number} of 6{meta.tag === 'Final step' ? '' : ` · ${meta.tag}`}
            </span>
            <h1 className="text-[28px] leading-tight font-bold">{title}</h1>
            <p className="text-[15px] leading-relaxed text-neutral-700">{description}</p>
          </header>
          {children}
          {!complete && hint && (
            <p role="status" className="text-sm text-neutral-600">
              {hint}
            </p>
          )}
          <footer className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {footer.onBack ? (
              <Button variant="outline" className="h-11 px-4" onClick={footer.onBack}>
                Back
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {footer.onSkip && (
                <Button
                  variant="ghost"
                  className="h-11 px-4 text-neutral-700"
                  onClick={footer.onSkip}
                >
                  Skip for now
                </Button>
              )}
              {footer.secondary}
              {footer.primary}
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}

/** Card wrapper used by every step section. */
export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-neutral-600">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
