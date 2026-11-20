'use client';

import type { CompleteOnboardingResponse, OnboardingStateResponse } from '@rms/api-contract';
import { createContext, type ReactElement, type ReactNode, useContext, useState } from 'react';

import { type OnboardingDraft, useOnboardingDraft } from './useOnboardingDraft';

type OnboardingContextValue = OnboardingDraft & {
  server: OnboardingStateResponse;
  /** Held in memory only: team passwords are shown once and never stored. */
  result: CompleteOnboardingResponse | null;
  setResult: (result: CompleteOnboardingResponse) => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({
  server,
  children,
}: {
  server: OnboardingStateResponse;
  children: ReactNode;
}): ReactElement {
  const draft = useOnboardingDraft(server);
  const [result, setResult] = useState<CompleteOnboardingResponse | null>(null);
  return (
    <OnboardingContext.Provider value={{ ...draft, server, result, setResult }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return value;
}
