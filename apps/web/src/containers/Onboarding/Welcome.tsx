'use client';

import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useProfile } from '@/services/api/requests/profile';
import { useLogout } from '@/store/hooks/auth';

import { savedAgo } from './format';
import { useOnboarding } from './OnboardingProvider';
import { setupProgress, stepStatus } from './progress';
import { stepMeta, stepPath, STEPS, WELCOMED_SESSION_KEY } from './steps';

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

/**
 * First visit: what the six steps need. Returning owner: a "Welcome back" card once per login,
 * then straight to the saved step.
 */
export default function Welcome(): ReactElement | null {
  const router = useRouter();
  const logout = useLogout();
  const profile = useProfile();
  const { draft, server, lastSavedAt, advance } = useOnboarding();
  const [welcomed, setWelcomed] = useState<boolean | null>(null);
  useEffect(() => setWelcomed(readWelcomed()), []);

  const resuming = draft.currentStep !== null;
  const firstName = profile.data?.name.split(' ')[0] ?? '';
  const restaurantName = draft.data.details?.name.trim() || server.restaurant.name;

  useEffect(() => {
    if (welcomed && resuming && draft.currentStep) router.replace(stepPath(draft.currentStep));
  }, [welcomed, resuming, draft.currentStep, router]);

  if (welcomed === null || (welcomed && resuming)) return null;

  function leave(): void {
    logout();
    router.replace('/auth/login');
  }

  async function start(): Promise<void> {
    markWelcomed();
    const target = draft.currentStep ?? 'details';
    if (!draft.currentStep) await advance(null, 'details');
    router.push(stepPath(target));
  }

  if (resuming && draft.currentStep) {
    const { settled, percent } = setupProgress(draft);
    const current = stepMeta(draft.currentStep);
    return (
      <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-4 py-12">
        <div className="flex w-full max-w-[520px] flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-8 sm:p-10">
          <div className="flex flex-col gap-2.5">
            <h1 className="text-[26px] font-bold">
              Welcome back{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-[15px] leading-relaxed text-neutral-700">
              Setup for {restaurantName} isn&apos;t finished yet. Everything you entered is saved.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[13px] text-neutral-700">
              <span>{settled} of 6 steps done</span>
              {lastSavedAt && <span>Last saved {savedAgo(lastSavedAt)}</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-neutral-900"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          <ul className="flex flex-col gap-2.5 text-sm">
            {STEPS.filter((m) => m.step !== 'review' && stepStatus(draft, m.step) !== 'todo').map(
              (m) => (
                <li key={m.step} className="flex items-center gap-2.5">
                  <span className="flex size-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
                    ✓
                  </span>
                  {m.label}
                  {stepStatus(draft, m.step) === 'skipped' && (
                    <span className="text-amber-800">· skipped</span>
                  )}
                </li>
              ),
            )}
            <li className="flex items-center gap-2.5 font-semibold">
              <span className="flex size-5 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white">
                {current.number}
              </span>
              {current.label} · you stopped here
            </li>
          </ul>
          <div className="flex flex-col gap-2">
            <Button className="h-11 w-full" onClick={() => void start()}>
              Continue with {current.label}
            </Button>
            <Button variant="ghost" className="h-11 w-full" onClick={leave}>
              Not you? Log out
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="flex w-full max-w-[760px] flex-col gap-8 rounded-2xl border border-neutral-200 bg-white p-8 sm:p-12">
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-semibold text-neutral-600">Account created</span>
          <h1 className="text-[30px] leading-tight font-bold">
            Welcome{firstName ? `, ${firstName}` : ''}. Let&apos;s set up {restaurantName}.
          </h1>
          <p className="text-[15px] leading-relaxed text-neutral-700">
            Six short steps, about 10 minutes. Skip anything you&apos;re not ready for. Your
            progress saves as you go, so you can close the tab and pick up where you left off next
            time you log in. Your team can log in once setup is finished.
          </p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((meta) => (
            <li
              key={meta.step}
              className="flex items-start gap-3 rounded-[10px] border border-neutral-100 p-3.5"
            >
              <span className="flex size-7 flex-none items-center justify-center rounded-full border-[1.5px] border-neutral-300 text-[13px] font-semibold">
                {meta.number}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">
                  {meta.label}{' '}
                  <span className="text-xs font-medium text-neutral-600">· {meta.tag}</span>
                </span>
                <span className="text-[13px] leading-snug text-neutral-600">{meta.need}</span>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" className="h-11" onClick={leave}>
            Log out
          </Button>
          <Button className="h-11 px-6" onClick={() => void start()}>
            Start setup
          </Button>
        </div>
      </div>
    </main>
  );
}
