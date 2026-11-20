'use client';

import type { OnboardingStep } from '@rms/api-contract';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

import { useOnboarding } from './OnboardingProvider';
import { nextStep, previousStep, stepPath } from './steps';

/**
 * Back / Skip / Continue for one step. Continue and Skip save before moving on; an "Edit" link from
 * Review (`?from=review`) returns there instead of to the next step.
 */
export function useStepNavigation(step: OnboardingStep): {
  back: () => void;
  skip: () => Promise<void>;
  next: () => Promise<void>;
  busy: boolean;
} {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { advance } = useOnboarding();
  const [busy, setBusy] = useState(false);
  const returnToReview = searchParams.get('from') === 'review' && step !== 'review';
  const target = returnToReview ? 'review' : nextStep(step);

  const go = useCallback(
    async (skip: boolean) => {
      setBusy(true);
      try {
        // A failed save is kept locally and retried; it never traps the owner on this step.
        await advance(step, target, skip);
        router.push(stepPath(target));
      } finally {
        setBusy(false);
      }
    },
    [advance, router, step, target],
  );

  return {
    back: () => {
      const previous = previousStep(step);
      router.push(previous ? stepPath(previous) : '/onboarding');
    },
    skip: () => go(true),
    next: () => go(false),
    busy,
  };
}
