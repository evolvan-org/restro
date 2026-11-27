import {
  type ChangePasswordRequest,
  type ChangePasswordResponse,
  changePasswordResponseSchema,
  type ProfileResponse,
  profileResponseSchema,
  type UpdateProfileRequest,
} from '@rms/api-contract';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';
import { useAccessToken, useLogout } from '@/store/hooks/auth';

import { ProfileQueryKey } from '../types/ProfileQueryKey';

/** Options for `useProfile`. */
type ProfileOptions = {
  /**
   * Keep re-checking (every 5 s, and on returning to the tab) until the email is verified, so a
   * screen waiting on verification updates by itself when the owner clicks the emailed link.
   */
  pollUntilVerified?: boolean;
};

export function useProfile({
  pollUntilVerified = false,
}: ProfileOptions = {}): UseQueryResult<ProfileResponse> {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: [ProfileQueryKey.Profile],
    queryFn: async (): Promise<ProfileResponse> => {
      const response = await api.get('/users/profile');
      return profileResponseSchema.parse(response.data);
    },
    enabled: Boolean(accessToken),
    ...(pollUntilVerified && {
      refetchInterval: (query) => (query.state.data?.emailVerifiedAt ? false : 5_000),
      refetchOnWindowFocus: (query) => (query.state.data?.emailVerifiedAt ? false : 'always'),
    }),
  });
}

export function useUpdateProfile(): UseMutationResult<
  ProfileResponse,
  Error,
  UpdateProfileRequest
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to update the profile.');

  return useMutation<ProfileResponse, Error, UpdateProfileRequest>({
    mutationFn: async (input: UpdateProfileRequest): Promise<ProfileResponse> => {
      const response = await api.patch('/users/profile', input);
      return profileResponseSchema.parse(response.data);
    },
    onSuccess: (profile) => {
      queryClient.setQueryData([ProfileQueryKey.Profile], profile);
    },
    onError: showApiError,
  });
}

export function useChangePassword(): UseMutationResult<
  ChangePasswordResponse,
  Error,
  ChangePasswordRequest
> {
  const showApiError = useShowApiError('Unable to change the password.');
  const logout = useLogout();

  return useMutation<ChangePasswordResponse, Error, ChangePasswordRequest>({
    mutationFn: async (input: ChangePasswordRequest): Promise<ChangePasswordResponse> => {
      const response = await api.patch('/users/profile/password', input);
      return changePasswordResponseSchema.parse(response.data);
    },
    // The API revokes every session on a password change, including this one.
    onSuccess: ({ message }) => {
      toast.success(message);
      logout();
    },
    onError: showApiError,
  });
}
