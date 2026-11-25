import type { OnboardingStep, SkippableOnboardingStep } from '@rms/api-contract';

export type StepMeta = {
  step: OnboardingStep;
  number: number;
  label: string;
  /** Shown on Welcome and in the stepper until the step is done or skipped. */
  tag: 'Recommended' | 'Optional' | 'Final step';
  need: string;
};

export const STEPS: readonly StepMeta[] = [
  {
    step: 'details',
    number: 1,
    label: 'Restaurant details',
    tag: 'Recommended',
    need: 'Address, GSTIN and your default GST rate.',
  },
  {
    step: 'floor',
    number: 2,
    label: 'Floor & tables',
    tag: 'Recommended',
    need: 'Your dining sections and how many tables each has.',
  },
  {
    step: 'menu',
    number: 3,
    label: 'Menu',
    tag: 'Optional',
    need: 'Scan a photo of your menu, import a CSV or add items by hand.',
  },
  {
    step: 'recipes',
    number: 4,
    label: 'Recipes & costs',
    tag: 'Optional',
    need: 'AI drafts a recipe and food cost for every dish. You review them.',
  },
  {
    step: 'inventory',
    number: 5,
    label: 'Inventory',
    tag: 'Optional',
    need: 'Ingredients from your recipes, real costs from a supplier invoice.',
  },
  {
    step: 'team',
    number: 6,
    label: 'Team',
    tag: 'Optional',
    need: 'Names and emails of managers, captains and cashiers.',
  },
  {
    step: 'review',
    number: 7,
    label: 'Review & finish',
    tag: 'Final step',
    need: 'Check everything, then we build your restaurant.',
  },
];

export const STEP_COUNT = STEPS.length;

export function stepMeta(step: OnboardingStep): StepMeta {
  return STEPS.find((meta) => meta.step === step) ?? STEPS[0]!;
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  const index = STEPS.findIndex((meta) => meta.step === step);
  return STEPS[Math.min(index + 1, STEPS.length - 1)]!.step;
}

export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const index = STEPS.findIndex((meta) => meta.step === step);
  return index > 0 ? STEPS[index - 1]!.step : null;
}

export function stepPath(step: OnboardingStep): string {
  return `/onboarding/${step}`;
}

export function isSkippable(step: OnboardingStep): step is SkippableOnboardingStep {
  return step !== 'review';
}

/** Set once the owner has seen Welcome in this tab; later visits go straight to the saved step. */
export const WELCOMED_SESSION_KEY = 'rms.onboarding.welcomed';
