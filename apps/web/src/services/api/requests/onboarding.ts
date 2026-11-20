import {
  type CompleteOnboardingRequest,
  type CompleteOnboardingResponse,
  completeOnboardingResponseSchema,
  onboardingEmailAvailabilityResponseSchema,
  type OnboardingInventoryPreviewResponse,
  onboardingInventoryPreviewResponseSchema,
  type OnboardingMenuPreviewResponse,
  onboardingMenuPreviewResponseSchema,
  type OnboardingStateResponse,
  onboardingStateResponseSchema,
  type ProfileResponse,
  type SaveOnboardingDraftRequest,
  type SaveOnboardingDraftResponse,
  saveOnboardingDraftResponseSchema,
  type SetupChecklistResponse,
  setupChecklistResponseSchema,
} from '@rms/api-contract';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '@/lib/api';
import store from '@/store';
import { useAccessToken } from '@/store/hooks/auth';

import { OnboardingQueryKey } from '../types/OnboardingQueryKey';
import { ProfileQueryKey } from '../types/ProfileQueryKey';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export function useOnboardingState(enabled = true): UseQueryResult<OnboardingStateResponse> {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: [OnboardingQueryKey.State],
    queryFn: async (): Promise<OnboardingStateResponse> => {
      const response = await api.get('/onboarding', { errorDisplay: 'inline' });
      return onboardingStateResponseSchema.parse(response.data);
    },
    enabled: enabled && Boolean(accessToken),
    // The draft hook owns the live copy; refetching underneath it would only cause conflicts.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Errors are handled by the caller (a 409 carries the latest draft). */
export async function saveOnboardingDraft(
  input: SaveOnboardingDraftRequest,
): Promise<SaveOnboardingDraftResponse> {
  const response = await api.put('/onboarding/draft', input, { errorDisplay: 'inline' });
  return saveOnboardingDraftResponseSchema.parse(response.data);
}

/**
 * Last-chance save as the tab is hidden or closed. `keepalive` lets the request outlive the page,
 * which axios can't do; the response is never read.
 */
export function saveOnboardingDraftOnExit(input: SaveOnboardingDraftRequest): void {
  const { accessToken } = store.getState().auth;
  if (!accessToken) return;
  void fetch(`${API_URL}/onboarding/draft`, {
    method: 'PUT',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  }).catch(() => {
    // The local copy still holds the change and is pushed on the next visit.
  });
}

export async function isOnboardingEmailAvailable(email: string): Promise<boolean> {
  const response = await api.get('/onboarding/email-available', {
    params: { email },
    errorDisplay: 'inline',
  });
  return onboardingEmailAvailabilityResponseSchema.parse(response.data).available;
}

function csvForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}

export function usePreviewMenuCsv(): UseMutationResult<OnboardingMenuPreviewResponse, Error, File> {
  return useMutation<OnboardingMenuPreviewResponse, Error, File>({
    mutationFn: async (file) => {
      const response = await api.post('/onboarding/menu/preview', csvForm(file), {
        errorDisplay: 'inline',
      });
      return onboardingMenuPreviewResponseSchema.parse(response.data);
    },
  });
}

export function usePreviewInventoryCsv(): UseMutationResult<
  OnboardingInventoryPreviewResponse,
  Error,
  File
> {
  return useMutation<OnboardingInventoryPreviewResponse, Error, File>({
    mutationFn: async (file) => {
      const response = await api.post('/onboarding/inventory/preview', csvForm(file), {
        errorDisplay: 'inline',
      });
      return onboardingInventoryPreviewResponseSchema.parse(response.data);
    },
  });
}

export function useCompleteOnboarding(): UseMutationResult<
  CompleteOnboardingResponse,
  Error,
  CompleteOnboardingRequest
> {
  const queryClient = useQueryClient();
  return useMutation<CompleteOnboardingResponse, Error, CompleteOnboardingRequest>({
    mutationFn: async (input) => {
      const response = await api.post('/onboarding/complete', input, { errorDisplay: 'inline' });
      return completeOnboardingResponseSchema.parse(response.data);
    },
    onSuccess: () => {
      queryClient.setQueryData<ProfileResponse>([ProfileQueryKey.Profile], (profile) =>
        profile ? { ...profile, onboarding: 'COMPLETED' } : profile,
      );
      queryClient.removeQueries({ queryKey: [OnboardingQueryKey.State] });
    },
  });
}

export function useSetupChecklist(enabled: boolean): UseQueryResult<SetupChecklistResponse> {
  return useQuery({
    queryKey: [OnboardingQueryKey.Checklist],
    queryFn: async (): Promise<SetupChecklistResponse> => {
      const response = await api.get('/onboarding/checklist', { errorDisplay: 'inline' });
      return setupChecklistResponseSchema.parse(response.data);
    },
    enabled,
  });
}
