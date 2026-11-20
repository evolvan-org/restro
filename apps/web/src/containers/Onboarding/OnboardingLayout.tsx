'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactElement, type ReactNode, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { useOnboardingState } from '@/services/api/requests/onboarding';

import { OnboardingProvider } from './OnboardingProvider';

/** Routes that run after (or while) finishing, so a COMPLETED status must not bounce them. */
const FINISH_ROUTES = ['/onboarding/finishing', '/onboarding/ready'];

/**
 * Loads the owner's draft once for every onboarding route. The provider stays mounted while the
 * owner moves between steps, so the draft, its save timers and the finish result survive navigation.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const state = useOnboardingState();
  // Once loaded, the provider owns the draft; never remount it on a background refetch.
  const loaded = useRef(state.data);
  if (state.data && !loaded.current) loaded.current = state.data;

  const completed = state.data?.status === 'COMPLETED';
  const onFinishRoute = FINISH_ROUTES.includes(pathname);
  useEffect(() => {
    if (completed && !onFinishRoute) router.replace('/dashboard');
  }, [completed, onFinishRoute, router]);

  if (state.isError) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-4">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <p className="text-sm text-neutral-700">We couldn&apos;t load your setup progress.</p>
          <Button onClick={() => void state.refetch()}>Try again</Button>
        </div>
      </main>
    );
  }

  if (!loaded.current || (completed && !onFinishRoute)) {
    return <div className="min-h-svh bg-neutral-50" aria-busy="true" />;
  }

  return <OnboardingProvider server={loaded.current}>{children}</OnboardingProvider>;
}
