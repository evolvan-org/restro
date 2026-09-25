import {
  changePasswordResponseSchema,
  profileResponseSchema,
  type ChangePasswordRequest,
  type ChangePasswordResponse,
  type ProfileResponse,
  type UpdateProfileRequest,
} from '@rms/api-contract';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
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

  return useMutation({
    mutationFn: async (input: UpdateProfileRequest): Promise<ProfileResponse> => {
      const response = await api.patch('/profile', input);
      return profileResponseSchema.parse(response.data);
    },
    onSuccess: (profile) => {
      queryClient.setQueryData([ProfileQueryKey.Profile], profile);
    },
  });
}

export function useChangePassword(): UseMutationResult<
  ChangePasswordResponse,
  Error,
  ChangePasswordRequest
> {
  return useMutation({
    mutationFn: async (input: ChangePasswordRequest): Promise<ChangePasswordResponse> => {
      const response = await api.patch('/profile/password', input);
      return changePasswordResponseSchema.parse(response.data);
    },
  });
}
