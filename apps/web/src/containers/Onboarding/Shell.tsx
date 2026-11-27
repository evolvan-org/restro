'use client';

import type { OnboardingStep } from '@rms/api-contract';
import { cn } from 'cn';
import { ArrowLeft, Check, CircleCheck, ListChecks, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactElement, type ReactNode, useState } from 'react';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useLogout } from '@/store/hooks/auth';

import { savedAgo } from './format';
import { useOnboarding } from './OnboardingProvider';
import { canOpenStep, setupProgress, stepStatus } from './progress';
import { STEP_COUNT, stepMeta, stepPath, STEPS } from './steps';
import { btn, Card, PageHead } from './ui/kit';

/** "Saved just now" in the top bar. */
export function SaveIndicator({ label }: { label?: string }): ReactElement {
  const { saveStatus, lastSavedAt } = useOnboarding();
  const text =
    label ??
    (saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'offline'
        ? 'Offline · saved on this device'
        : saveStatus === 'error'
          ? "Couldn't save · kept on this device"
          : lastSavedAt
            ? `Saved ${savedAgo(lastSavedAt)}`
            : 'Saves as you go');
  return (
    <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground" aria-live="polite">
      <CircleCheck
        className={cn(
          'size-[15px]',
          saveStatus === 'saved' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-600',
        )}
        aria-hidden
      />
      <span className="hidden sm:inline">{text}</span>
    </p>
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

/** Top bar (design: logo · "Restro setup" / restaurant name · saved state). */
export function TopBar({
  savedLabel,
  right,
}: {
  savedLabel?: string;
  right?: ReactNode;
}): ReactElement {
  const { draft, server } = useOnboarding();
  const restaurantName = draft.data.details?.name.trim() || server.restaurant.name;
  return (
    <header className="flex h-14 flex-none items-center gap-3 border-b border-border bg-background px-4 sm:gap-4 sm:px-6">
      <span className="flex size-7 flex-none items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        R
      </span>
      <span className="text-sm font-semibold whitespace-nowrap">Restro setup</span>
      <span className="hidden text-muted-foreground sm:inline" aria-hidden>
        /
      </span>
      <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:inline">
        {restaurantName}
      </span>
      <span className="flex-1" />
      <SaveIndicator label={savedLabel} />
      {right}
    </header>
  );
}

/** Horizontal stepper (design .steps): dots joined by lines, label and state under each. */
function Stepper({ current }: { current: OnboardingStep }): ReactElement {
  const { draft } = useOnboarding();
  return (
    <nav
      aria-label="Setup steps"
      className="hidden flex-none border-b border-border bg-background px-8 pt-[18px] pb-3.5 lg:block"
    >
      <ol className="mx-auto flex max-w-[1280px] items-start">
        {STEPS.map((meta, index) => {
          const isCurrent = meta.step === current;
          const status = stepStatus(draft, meta.step);
          const open = canOpenStep(draft, meta.step);
          const sub = isCurrent
            ? meta.tag
            : status === 'done'
              ? 'Done'
              : status === 'skipped'
                ? 'Skipped'
                : draft.data.deferred?.includes(meta.step as never)
                  ? 'To do'
                  : meta.tag;
          const dot = (
            <span
              className={cn(
                'relative z-10 flex size-7 items-center justify-center rounded-full border-2 bg-background text-[13px] font-semibold',
                isCurrent && 'border-primary text-foreground shadow-[0_0_0_4px_var(--border)]',
                !isCurrent &&
                  status === 'done' &&
                  'border-primary bg-primary text-primary-foreground',
                !isCurrent &&
                  status === 'skipped' &&
                  'border-zinc-300 bg-muted text-muted-foreground',
                !isCurrent &&
                  status === 'todo' &&
                  'border-dashed border-zinc-300 text-muted-foreground',
              )}
            >
              {!isCurrent && status === 'done' ? (
                <Check className="size-[15px]" strokeWidth={3} aria-hidden />
              ) : !isCurrent && status === 'skipped' ? (
                '–'
              ) : (
                index + 1
              )}
            </span>
          );
          const body = (
            <>
              {dot}
              <span
                className={cn(
                  'text-center text-[13px] font-semibold',
                  !open && 'text-muted-foreground',
                )}
              >
                {meta.label}
              </span>
              <span className="text-center text-[11.5px] text-muted-foreground">
                {open ? sub : 'To do'}
                <span className="sr-only">{isCurrent ? ', current step' : ''}</span>
              </span>
            </>
          );
          return (
            <li key={meta.step} className="relative flex min-w-0 flex-1 flex-col items-center">
              {index < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-3.5 right-[calc(-50%+20px)] left-[calc(50%+20px)] h-0.5',
                    status === 'done' && !isCurrent ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700',
                  )}
                />
              )}
              {open && !isCurrent ? (
                <Link
                  href={stepPath(meta.step)}
                  className="flex flex-col items-center gap-1.5 rounded-md px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  {body}
                </Link>
              ) : (
                <span
                  className="flex flex-col items-center gap-1.5 px-1"
                  aria-current={isCurrent ? 'step' : undefined}
                  title={open ? undefined : 'Finish the earlier steps first'}
                >
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The step list inside the mobile / tablet sheet. */
function StepList({
  current,
  onNavigate,
}: {
  current: OnboardingStep;
  onNavigate: () => void;
}): ReactElement {
  const { draft } = useOnboarding();
  return (
    <ol className="flex flex-col gap-0.5">
      {STEPS.map((meta, index) => {
        const isCurrent = meta.step === current;
        const status = stepStatus(draft, meta.step);
        const open = canOpenStep(draft, meta.step);
        const content = (
          <>
            <span
              className={cn(
                'flex size-7 flex-none items-center justify-center rounded-full border-2 text-[13px] font-semibold',
                isCurrent
                  ? 'border-primary'
                  : status === 'done'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-zinc-300 text-muted-foreground',
                status === 'todo' && !isCurrent && 'border-dashed',
              )}
            >
              {status === 'done' && !isCurrent ? (
                <Check className="size-3.5" strokeWidth={3} aria-label="Done" />
              ) : (
                index + 1
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn('text-sm', isCurrent ? 'font-semibold' : 'font-medium')}>
                {meta.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {!open
                  ? 'Locked · finish earlier steps'
                  : isCurrent
                    ? 'In progress'
                    : status === 'done'
                      ? 'Done'
                      : status === 'skipped'
                        ? 'Skipped'
                        : meta.tag}
              </span>
            </span>
            {!open && <Lock className="size-3.5 text-muted-foreground" aria-hidden />}
          </>
        );
        return (
          <li key={meta.step}>
            {open ? (
              <Link
                href={stepPath(meta.step)}
                onClick={onNavigate}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2',
                  isCurrent ? 'bg-muted' : 'hover:bg-muted',
                )}
              >
                {content}
              </Link>
            ) : (
              <div
                aria-disabled="true"
                className="flex min-h-11 items-center gap-3 px-3 py-2 opacity-60"
              >
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export type ShellFooter = {
  onBack?: () => void;
  onSkip?: () => void;
  /** Extra action placed before the primary one (e.g. "Import 40, leave out 2"). */
  secondary?: ReactNode;
  primary?: ReactNode;
  /** Short status text beside the primary action. */
  note?: ReactNode;
};

/** The design's footer bar: Back · Skip this step · note · primary. */
export function FooterBar({
  footer,
  center = false,
}: {
  footer: ShellFooter;
  center?: boolean;
}): ReactElement {
  return (
    <footer
      className={cn(
        'sticky bottom-0 z-20 flex min-h-[72px] flex-none flex-wrap items-center gap-3 border-t border-border bg-background px-4 py-3 sm:px-8',
        center && 'justify-center',
      )}
    >
      {footer.onBack && (
        <button type="button" className={btn()} onClick={footer.onBack}>
          <ArrowLeft aria-hidden />
          Back
        </button>
      )}
      {footer.onSkip && (
        <button type="button" className={btn('ghost')} onClick={footer.onSkip}>
          Skip this step
        </button>
      )}
      {!center && <span className="flex-1" />}
      {footer.note && (
        <span className="hidden text-[13px] text-muted-foreground md:inline">{footer.note}</span>
      )}
      {footer.secondary}
      {footer.primary}
    </footer>
  );
}

/**
 * The frame around every step (design: top bar, horizontal stepper, the step's content, footer bar).
 * Below 1024px the stepper collapses to "Step n of 7" with a sheet listing every step.
 */
export default function Shell({
  step,
  title,
  description,
  headerRight,
  footer,
  complete = true,
  hint,
  width = 'narrow',
  floating,
  children,
}: {
  step: OnboardingStep;
  title?: string;
  description?: ReactNode;
  headerRight?: ReactNode;
  footer: ShellFooter;
  /** False while a recommended step isn't filled in: Save and exit stays off. */
  complete?: boolean;
  /** What is still missing, shown above the footer while `complete` is false. */
  hint?: string;
  /** Form steps read best narrow; review tables and split views need the full width. */
  width?: 'narrow' | 'wide';
  /** Floating progress pill (renders above the footer). */
  floating?: ReactNode;
  children: ReactNode;
}): ReactElement {
  const { draft } = useOnboarding();
  const { percent } = setupProgress(draft);
  const { exit, exiting } = useSaveAndExit();
  const [sheetOpen, setSheetOpen] = useState(false);
  const meta = stepMeta(step);

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <TopBar
        right={
          <button
            type="button"
            className={btn('ghost', 'sm')}
            onClick={() => void exit()}
            disabled={exiting || !complete}
            title={complete ? undefined : 'Fill in this step to save and exit'}
          >
            {exiting ? 'Saving…' : 'Save and exit'}
          </button>
        }
      />
      <Stepper current={step} />
      <div className="flex flex-none items-center justify-between gap-3 border-b border-border bg-background px-4 py-2.5 lg:hidden">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="truncate text-sm font-semibold">
            Step {meta.number} of {STEP_COUNT} · {meta.label}
          </span>
          <span className="h-1.5 w-40 overflow-hidden rounded-full bg-border" aria-hidden>
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${percent}%` }}
            />
          </span>
        </div>
        <button
          type="button"
          className={btn('default', 'sm')}
          onClick={() => setSheetOpen(true)}
          aria-label="All setup steps"
        >
          <ListChecks aria-hidden />
          Steps
        </button>
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="gap-5 p-5">
          <SheetHeader className="p-0">
            <SheetTitle>Setup steps</SheetTitle>
          </SheetHeader>
          <nav aria-label="Setup steps">
            <StepList current={step} onNavigate={() => setSheetOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col px-4 py-6 sm:px-8">
        <div
          className={cn(
            'mx-auto flex w-full flex-col gap-4',
            width === 'wide' ? 'max-w-[1280px]' : 'max-w-[880px]',
          )}
        >
          {title && <PageHead title={title} sub={description} right={headerRight} />}
          {children}
          {!complete && hint && (
            <p role="status" className="text-sm text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
      </main>
      {floating}
      <FooterBar footer={footer} />
    </div>
  );
}

/** Card section used by the form steps (Details, Floor, Team, …). */
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
    <Card as="section" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}
