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

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';
import { useAccessToken } from '@/store/hooks/auth';

import { ProfileQueryKey } from '../types/ProfileQueryKey';

export function useProfile(): UseQueryResult<ProfileResponse> {
  const accessToken = useAccessToken();

  return useQuery({
    queryKey: [ProfileQueryKey.Profile],
    queryFn: async (): Promise<ProfileResponse> => {
      const response = await api.get('/profile');
      return profileResponseSchema.parse(response.data);
    },
    enabled: Boolean(accessToken),
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
      const response = await api.patch('/profile', input);
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

  return useMutation<ChangePasswordResponse, Error, ChangePasswordRequest>({
    mutationFn: async (input: ChangePasswordRequest): Promise<ChangePasswordResponse> => {
      const response = await api.patch('/profile/password', input);
      return changePasswordResponseSchema.parse(response.data);
    },
    onError: showApiError,
  });
}
