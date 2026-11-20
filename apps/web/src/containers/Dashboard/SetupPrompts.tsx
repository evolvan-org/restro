'use client';

import { Permission } from '@rms/permissions';
import {
  ArrowRight,
  CircleCheck,
  Lock,
  type LucideIcon,
  NotebookText,
  PackageOpen,
  Store,
  Table2,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useEffect, useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import usePermissions from '@/hooks/auth/usePermissions';
import { useSetupChecklist } from '@/services/api/requests/onboarding';
import { useProfile } from '@/services/api/requests/profile';

type StepKey = 'details' | 'floor' | 'menu' | 'inventory' | 'team' | 'recipes';
type Action = { label: string; href: string };

type SetupStep = {
  key: StepKey;
  label: string;
  /** Short hint shown in the "Still to do" list. */
  hint: string;
  minutes: number;
  icon: LucideIcon;
  title: string;
  description: string;
  primary: Action;
  secondary?: Action;
};

const STEPS: readonly SetupStep[] = [
  {
    key: 'details',
    label: 'Restaurant details',
    hint: 'address and GSTIN',
    minutes: 1,
    icon: Store,
    title: 'Add your restaurant details',
    description: 'Your address and GSTIN are printed on every bill and GST invoice.',
    primary: { label: 'Add details', href: '/restaurant/settings/general' },
  },
  {
    key: 'floor',
    label: 'Floor & tables',
    hint: 'add sections and tables',
    minutes: 3,
    icon: Table2,
    title: 'Set up your floor',
    description:
      'Add your dining sections and tables so the live floor board and your captains have something to work with.',
    primary: { label: 'Add tables', href: '/restaurant/settings/tables' },
    secondary: { label: 'Add sections', href: '/restaurant/settings/dining-sections' },
  },
  {
    key: 'menu',
    label: 'Menu',
    hint: 'add dishes and drinks',
    minutes: 3,
    icon: UtensilsCrossed,
    title: 'Add your menu',
    description:
      "Captains can't take orders until there's a menu. Add your dishes and drinks to get started.",
    primary: { label: 'Add menu items', href: '/menu/items' },
  },
  {
    key: 'inventory',
    label: 'Inventory',
    hint: 'import ingredients',
    minutes: 3,
    icon: PackageOpen,
    title: 'Add your ingredients',
    description:
      'Import your ingredients from a CSV, with opening stock if you have it, so recipes can track what you use.',
    primary: { label: 'Import ingredients', href: '/inventory' },
    secondary: { label: 'Add manually', href: '/inventory' },
  },
  {
    key: 'team',
    label: 'Team',
    hint: 'add managers and captains',
    minutes: 2,
    icon: Users,
    title: 'Add your team',
    description:
      'Invite managers, captains and cashiers by email so they can log in and get to work.',
    primary: { label: 'Invite your team', href: '/restaurant/settings/team' },
  },
  {
    key: 'recipes',
    label: 'Recipes',
    hint: 'unlocks after menu',
    minutes: 10,
    icon: NotebookText,
    title: 'Add recipes to your menu items',
    description:
      'Orders already work. Recipes link each dish to its ingredients so stock goes down as you sell. Bottled drinks and the like can be marked "No recipe needed".',
    primary: { label: 'Add recipes', href: '/menu/items' },
    secondary: { label: 'Mark items with no recipe', href: '/menu/items' },
  },
];

const HIDE_KEY = 'rms-setup-card-hidden-until';
const CARD_SEEN_KEY = 'rms-setup-card-seen';
const COMPLETE_SEEN_KEY = 'rms-setup-complete-seen';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered across reloads; the card still hides for this visit.
  }
}

function tomorrowMorning(): number {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);
  return date.getTime();
}

function SetupComplete({ onDismiss }: { onDismiss: () => void }): ReactElement {
  return (
    <aside
      role="status"
      className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
    >
      <span className="flex size-10 flex-none items-center justify-center rounded-full bg-emerald-600 text-white">
        <CircleCheck className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Setup complete</p>
        <p className="text-sm">
          Your restaurant is fully set up. This message won&apos;t show again.
        </p>
      </div>
      <Button variant="ghost" className="size-11" aria-label="Dismiss" onClick={onDismiss}>
        <X aria-hidden />
      </Button>
    </aside>
  );
}

/**
 * The dashboard's setup guidance, derived from what exists (not from the saved draft): a
 * "Finish setting up" card with the next step up front, and a one-time "Setup complete" banner once
 * everything is done. Shown to owners and managers.
 */
export default function SetupPrompts(): ReactElement | null {
  const { can } = usePermissions();
  const { data: profile } = useProfile();
  const canWrite = can(Permission.MENU_WRITE);
  const checklist = useSetupChecklist(canWrite);
  const suffix = profile?.email ?? '';
  const hideKey = `${HIDE_KEY}:${suffix}`;
  const cardSeenKey = `${CARD_SEEN_KEY}:${suffix}`;
  const completeSeenKey = `${COMPLETE_SEEN_KEY}:${suffix}`;

  const [hidden, setHidden] = useState(true);
  const [showComplete, setShowComplete] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const data = checklist.data;
  const done: Record<StepKey, boolean> | null = data
    ? {
        details: data.details,
        floor: data.floor,
        menu: data.menu,
        inventory: data.inventory,
        team: data.team,
        // Recipes only count once there's a menu to give recipes to.
        recipes: data.menu && data.missingRecipeCount === 0,
      }
    : null;
  const allDone = done !== null && STEPS.every((step) => done[step.key]);

  useEffect(() => {
    setHidden(Number(readStorage(hideKey)) > Date.now());
  }, [hideKey]);

  const ready = done !== null;
  useEffect(() => {
    if (!ready) return;
    if (!allDone) {
      writeStorage(cardSeenKey, '1');
      return;
    }
    // The banner replaces the card once, and only for someone who saw the card.
    if (readStorage(cardSeenKey) && !readStorage(completeSeenKey)) {
      writeStorage(completeSeenKey, '1');
      setShowComplete(true);
    }
  }, [ready, allDone, cardSeenKey, completeSeenKey]);

  if (!canWrite || !data || !done) return null;

  if (allDone) {
    return showComplete ? (
      <div className="shrink-0 px-4 pb-4 sm:px-6 xl:px-8">
        <SetupComplete onDismiss={() => setShowComplete(false)} />
      </div>
    ) : null;
  }
  if (hidden) return null;

  // Recipes stay locked until there is a menu, so they can't be the next step before it.
  const locked = (step: SetupStep): boolean => step.key === 'recipes' && !data.menu;
  const remaining = STEPS.filter((step) => !done[step.key]);
  const next = remaining.find((step) => !locked(step));
  if (!next) return null;

  const position = STEPS.indexOf(next) + 1;
  const isLast = remaining.length === 1;
  const stillToDo = remaining.filter((step) => step !== next);
  const completed = STEPS.filter((step) => done[step.key]);
  const Icon = next.icon;
  const title =
    next.key === 'recipes'
      ? `Add recipes to ${data.missingRecipeCount} menu ${data.missingRecipeCount === 1 ? 'item' : 'items'}`
      : next.title;

  return (
    <div className="shrink-0 px-4 pb-4 sm:px-6 xl:px-8">
      <section
        aria-label="Finish setting up"
        className="overflow-hidden rounded-xl border bg-background"
      >
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-4">
          <h2 className="text-base font-semibold">Finish setting up</h2>
          <div
            className="h-1.5 w-40 flex-none overflow-hidden rounded-full bg-neutral-100 sm:w-48"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuenow={completed.length}
            aria-valuemin={0}
            aria-valuemax={STEPS.length}
          >
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{ width: `${(completed.length / STEPS.length) * 100}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {completed.length} of {STEPS.length} done
          </span>
          <Button
            variant="ghost"
            className="ml-auto h-11 font-semibold"
            onClick={() => {
              writeStorage(hideKey, String(tomorrowMorning()));
              setHidden(true);
            }}
          >
            Hide for now
          </Button>
        </header>

        <div className="xl:grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex gap-4 bg-neutral-50 px-5 py-5">
            <span className="flex size-12 flex-none items-center justify-center rounded-xl bg-neutral-900 text-white">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-xs font-semibold tracking-wider text-neutral-600 uppercase">
                {isLast
                  ? `Last step · about ${next.minutes} min`
                  : `Up next · step ${position} of ${STEPS.length} · about ${next.minutes} min`}
              </p>
              <h3 className="text-xl font-bold">{title}</h3>
              <p className="max-w-xl text-[15px] leading-relaxed text-neutral-700">
                {next.description}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href={next.primary.href}
                  className={buttonVariants({ className: 'h-11 px-5 text-sm font-semibold' })}
                >
                  {next.primary.label}
                </Link>
                {next.secondary && (
                  <Link
                    href={next.secondary.href}
                    className={buttonVariants({
                      variant: 'outline',
                      className: 'h-11 bg-background px-5 text-sm font-semibold',
                    })}
                  >
                    {next.secondary.label}
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col border-t px-5 py-4 xl:border-t-0 xl:border-l">
            <h3 className="pb-2 text-sm font-semibold">Still to do</h3>
            <ul className="flex flex-col">
              {stillToDo.length === 0 && (
                <li className="border-t py-3 text-[15px]">Nothing else. This is the last one.</li>
              )}
              {stillToDo.map((step) =>
                locked(step) ? (
                  <li
                    key={step.key}
                    className="flex min-h-12 items-center gap-3 border-t py-3 text-[15px] text-muted-foreground"
                  >
                    <Lock className="size-4 flex-none" aria-hidden />
                    <span>
                      {step.label} · {step.hint}
                    </span>
                  </li>
                ) : (
                  <li key={step.key} className="border-t">
                    <Link
                      href={step.primary.href}
                      className="flex min-h-12 items-center gap-3 py-3 text-[15px] hover:underline"
                    >
                      <span
                        className="size-5 flex-none rounded-full border-[1.5px] border-neutral-300"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        {step.label} <span className="text-muted-foreground">· {step.hint}</span>
                      </span>
                      <ArrowRight className="size-4 flex-none" aria-hidden />
                    </Link>
                  </li>
                ),
              )}
              {completed.length > 0 && (
                <li className="border-t">
                  <div className="flex min-h-12 items-center gap-3 py-3 text-[15px] text-emerald-700">
                    <CircleCheck className="size-5 flex-none text-emerald-600" aria-hidden />
                    <span className="flex-1">{completed.length} done</span>
                    <Button
                      variant="ghost"
                      className="h-11 text-muted-foreground"
                      aria-expanded={showDone}
                      onClick={() => setShowDone(!showDone)}
                    >
                      {showDone ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  {showDone && (
                    <ul className="flex flex-col gap-1 pb-3 pl-8 text-sm text-muted-foreground">
                      {completed.map((step) => (
                        <li key={step.key}>{step.label}</li>
                      ))}
                    </ul>
                  )}
                </li>
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
