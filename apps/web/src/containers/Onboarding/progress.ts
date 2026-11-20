import { ONBOARDING_STEPS, type OnboardingStep } from '@rms/api-contract';

import type { DraftState } from './useOnboardingDraft';

export type StepStatus = 'done' | 'skipped' | 'todo';

/** Steps before the furthest one reached are done unless the owner skipped them. */
export function stepStatus(draft: DraftState, step: OnboardingStep): StepStatus {
  if (step !== 'review' && draft.skippedSteps.includes(step)) return 'skipped';
  const reached = draft.currentStep ? ONBOARDING_STEPS.indexOf(draft.currentStep) : -1;
  return ONBOARDING_STEPS.indexOf(step) < reached ? 'done' : 'todo';
}

export function setupProgress(draft: DraftState): { settled: number; percent: number } {
  const settled = ONBOARDING_STEPS.filter((step) => stepStatus(draft, step) !== 'todo').length;
  return { settled, percent: Math.round((settled / ONBOARDING_STEPS.length) * 100) };
}

/** Index of the furthest step the owner has reached (0 until they start). */
export function furthestStepIndex(draft: DraftState): number {
  return draft.currentStep ? ONBOARDING_STEPS.indexOf(draft.currentStep) : 0;
}

/**
 * Steps open in order: the owner can revisit any step up to the furthest one reached, but not jump
 * ahead of it. Once the last step is reached every step has been visited, so all are open.
 */
export function canOpenStep(draft: DraftState, step: OnboardingStep): boolean {
  return ONBOARDING_STEPS.indexOf(step) <= furthestStepIndex(draft);
}
