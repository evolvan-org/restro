'use client';

import { ONBOARDING_STEPS, onboardingStepSchema } from '@rms/api-contract';
import { useParams, useRouter } from 'next/navigation';
import { type ReactElement, Suspense, useEffect } from 'react';

import { useOnboarding } from './OnboardingProvider';
import { canOpenStep, furthestStepIndex } from './progress';
import { stepPath } from './steps';
import DetailsStep from './steps/DetailsStep';
import FloorStep from './steps/FloorStep';
import InventoryStep from './steps/InventoryStep';
import MenuStep from './steps/MenuStep';
import ReviewStep from './steps/ReviewStep';
import TeamStep from './steps/TeamStep';

const STEP_COMPONENTS = {
  details: DetailsStep,
  floor: FloorStep,
  menu: MenuStep,
  inventory: InventoryStep,
  team: TeamStep,
  review: ReviewStep,
} as const;

export default function OnboardingStepPage(): ReactElement | null {
  const router = useRouter();
  const params = useParams<{ step: string }>();
  const { draft } = useOnboarding();
  const step = onboardingStepSchema.safeParse(params.step).data;
  // Steps are taken in order: a URL ahead of the furthest step reached goes back to that step.
  const allowed = step ? canOpenStep(draft, step) : false;
  const furthest = ONBOARDING_STEPS[furthestStepIndex(draft)];

  useEffect(() => {
    if (!step) router.replace('/onboarding');
    else if (!allowed)
      router.replace(draft.currentStep && furthest ? stepPath(furthest) : '/onboarding');
  }, [step, allowed, draft.currentStep, furthest, router]);

  if (!step || !allowed) return null;
  const Step = STEP_COMPONENTS[step];
  // Steps read `?from=review`, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <Step />
    </Suspense>
  );
}
