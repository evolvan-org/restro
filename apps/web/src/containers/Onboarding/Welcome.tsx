'use client';

import { ArrowRight, Camera, Clock, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useState } from 'react';

import { useAiUsage } from '@/services/api/requests/ai';
import { useProfile } from '@/services/api/requests/profile';
import { useLogout } from '@/store/hooks/auth';

import { savedAgo } from './format';
import { useOnboarding } from './OnboardingProvider';
import { setupProgress, stepStatus } from './progress';
import { FooterBar, TopBar } from './Shell';
import { STEP_COUNT, stepMeta, stepPath, STEPS, WELCOMED_SESSION_KEY } from './steps';
import { btn, Card, Chip, ProgressBar } from './ui/kit';
import { PaperMenu } from './ui/PaperMenu';

function readWelcomed(): boolean {
  try {
    return window.sessionStorage.getItem(WELCOMED_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markWelcomed(): void {
  try {
    window.sessionStorage.setItem(WELCOMED_SESSION_KEY, '1');
  } catch {
    // Without session storage the card simply shows again next visit.
  }
}

/** Rough time per step on the Welcome list (design board "Welcome"). */
const STEP_TIME: Record<string, { time: string; detail: string }> = {
  details: { time: '2 min', detail: 'Address, GSTIN, default GST rate' },
  floor: { time: '3 min', detail: 'Dining sections and tables' },
  menu: { time: '1 min with a photo', detail: 'Scan a photo, import a CSV or add by hand' },
  recipes: { time: 'Automatic', detail: 'AI drafts a recipe and food cost for every dish' },
  inventory: {
    time: '1 min with an invoice',
    detail: 'Ingredients from your recipes, real costs from a supplier invoice',
  },
  team: { time: '2 min', detail: 'Invite managers, captains and others' },
  review: { time: '30 sec', detail: 'Check everything, then build your restaurant' },
};

/**
 * First visit: the photo shortcut and what each step needs (board "Welcome"). Returning owner: a
 * "Welcome back" card once per login, then straight to the saved step.
 */
export default function Welcome(): ReactElement | null {
  const router = useRouter();
  const logout = useLogout();
  const profile = useProfile();
  const { draft, server, lastSavedAt, advance, setStepData } = useOnboarding();
  const ai = useAiUsage();
  const aiEnabled = ai.data?.enabled !== false;
  const [welcomed, setWelcomed] = useState<boolean | null>(null);
  useEffect(() => setWelcomed(readWelcomed()), []);

  const resuming = draft.currentStep !== null;
  const firstName = profile.data?.name.split(' ')[0] ?? '';
  const restaurantName = draft.data.details?.name.trim() || server.restaurant.name;

  useEffect(() => {
    if (welcomed && resuming && draft.currentStep) router.replace(stepPath(draft.currentStep));
  }, [welcomed, resuming, draft.currentStep, router]);

  if (welcomed === null || (welcomed && resuming)) return null;

  async function start(): Promise<void> {
    markWelcomed();
    const target = draft.currentStep ?? 'details';
    if (!draft.currentStep) await advance(null, 'details');
    router.push(stepPath(target));
  }

  /** The photo shortcut: straight to Menu → Scan photo; Details and Floor stay "to do". */
  async function startWithPhoto(): Promise<void> {
    markWelcomed();
    setStepData('deferred', ['details', 'floor']);
    setStepData('menu', { ...(draft.data.menu ?? { rows: [] }), mode: 'scan' });
    await advance(null, 'menu');
    router.push(stepPath('menu'));
  }

  if (resuming && draft.currentStep) {
    const { settled, percent } = setupProgress(draft);
    const current = stepMeta(draft.currentStep);
    return (
      <div className="flex min-h-svh flex-col bg-background text-foreground">
        <TopBar />
        <main className="flex flex-1 items-center justify-center bg-muted px-4 py-12">
          <Card className="flex w-full max-w-[520px] flex-col gap-6 p-8 sm:p-10">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold tracking-[-0.02em]">
                Welcome back{firstName ? `, ${firstName}` : ''}
              </h1>
              <p className="text-[15px] text-muted-foreground">
                Setup for {restaurantName} isn&apos;t finished yet. Everything you entered is saved.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[13px] text-muted-foreground">
                <span>
                  {settled} of {STEP_COUNT} steps done
                </span>
                {lastSavedAt && <span>Last saved {savedAgo(lastSavedAt)}</span>}
              </div>
              <ProgressBar value={percent} label="Setup progress" />
            </div>
            <ul className="flex flex-col gap-2.5 text-sm">
              {STEPS.filter((m) => m.step !== 'review' && stepStatus(draft, m.step) !== 'todo').map(
                (m) => (
                  <li key={m.step} className="flex items-center gap-2.5">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      ✓
                    </span>
                    {m.label}
                    {stepStatus(draft, m.step) === 'skipped' && <Chip>Skipped</Chip>}
                  </li>
                ),
              )}
              <li className="flex items-center gap-2.5 font-semibold">
                <span className="flex size-5 items-center justify-center rounded-full border-2 border-primary text-[11px] font-bold">
                  {current.number}
                </span>
                {current.label} · you stopped here
              </li>
            </ul>
            <div className="flex flex-col gap-2">
              <button type="button" className={btn('primary')} onClick={() => void start()}>
                Continue with {current.label}
                <ArrowRight aria-hidden />
              </button>
              <button
                type="button"
                className={btn('ghost')}
                onClick={() => {
                  logout();
                  router.replace('/auth/login');
                }}
              >
                Not you? Log out
              </button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <TopBar savedLabel="Draft not started" />
      <main className="flex-1 px-4 py-7 sm:px-14">
        <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-[18px]">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em]">
              Welcome{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              Let&apos;s set up {restaurantName}. {STEP_COUNT === 7 ? 'Seven' : STEP_COUNT} short
              steps, all skippable.
            </p>
          </div>

          {aiEnabled && (
            <section className="relative flex items-center gap-7 overflow-hidden rounded-[10px] border border-primary bg-primary p-7 text-primary-foreground">
              <div className="min-w-0 flex-1">
                <Chip tone="ai">
                  <Sparkles aria-hidden />
                  AI
                </Chip>
                <h2 className="mt-2.5 text-[30px] leading-[1.15] font-bold tracking-[-0.02em]">
                  Have a photo of your menu? Start there.
                </h2>
                <p className="mt-2 text-[17px] opacity-85">
                  Set up in about 3 minutes. We read the menu, draft recipes and work out your food
                  cost. You review everything before it goes live.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={`${btn('default', 'lg')} border-white bg-white px-[22px] text-zinc-900 hover:bg-zinc-100`}
                    onClick={() => void startWithPhoto()}
                  >
                    <Camera aria-hidden />
                    Scan my menu
                  </button>
                  <span className="text-[13px] opacity-80">
                    Phone camera or drag a photo in. 2 to 8 pages.
                  </span>
                </div>
              </div>
              <div className="relative hidden h-[200px] w-[260px] flex-none md:block">
                <PaperMenu className="absolute -top-2 left-2.5 w-[240px] rotate-3" />
              </div>
            </section>
          )}

          <div className="flex flex-col items-start gap-6 lg:flex-row">
            <Card className="w-full flex-1 overflow-hidden">
              <ol>
                {STEPS.map((meta) => {
                  const info = STEP_TIME[meta.step];
                  return (
                    <li
                      key={meta.step}
                      className="flex min-h-14 items-center gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0"
                    >
                      <span className="flex size-[30px] flex-none items-center justify-center rounded-full border-2 border-zinc-300 text-[13px] font-semibold text-muted-foreground">
                        {meta.number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{meta.label}</span>
                          {meta.tag !== 'Final step' && <Chip>{meta.tag}</Chip>}
                          {meta.step === 'recipes' && <Chip tone="ai">New</Chip>}
                        </div>
                        <div className="text-[13px] text-muted-foreground">
                          {info?.detail ?? meta.need}
                        </div>
                      </div>
                      <span className="flex flex-none items-center gap-1 text-[13px] text-muted-foreground">
                        <Clock className="size-[13px]" aria-hidden />
                        {info?.time}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </Card>
            <div className="flex w-full flex-none flex-col gap-3.5 lg:w-[340px]">
              <Card className="p-[18px]">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="size-4" aria-hidden />
                  The AI drafts. You decide.
                </h3>
                <ul className="mt-2.5 list-disc pl-[18px] leading-[1.7] text-muted-foreground">
                  <li>Everything it reads lands in a draft you can edit.</li>
                  <li>Uncertain values are flagged, never applied silently.</li>
                  <li>Nothing is created until you press Finish.</li>
                </ul>
              </Card>
              <Card className="p-[18px]">
                <h3 className="text-sm font-semibold">Saved as you go</h3>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  Close the tab and come back. Your draft is waiting.
                </p>
              </Card>
              <button
                type="button"
                className={`${btn('ghost', 'sm')} self-start`}
                onClick={() => {
                  logout();
                  router.replace('/auth/login');
                }}
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </main>
      <FooterBar
        footer={{
          note: 'Takes about 10 minutes in total, less with a menu photo.',
          primary: (
            <button type="button" className={btn('primary')} onClick={() => void start()}>
              Start with restaurant details
              <ArrowRight aria-hidden />
            </button>
          ),
        }}
      />
    </div>
  );
}
