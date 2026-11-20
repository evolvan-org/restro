import {
  type CreateStaffRequest,
  type CreateStaffResponse,
  createStaffResponseSchema,
  type StaffAccount,
  staffAccountSchema,
  type StaffEmailActionResponse,
  staffEmailActionResponseSchema,
  type StaffListQuery,
  type StaffListResponse,
  staffListResponseSchema,
  type StaffRolesResponse,
  staffRolesResponseSchema,
  type UpdateStaffRequest,
  type UpdateStaffStatusRequest,
} from '@rms/api-contract';
import {
  keepPreviousData,
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import useShowApiError from '@/hooks/api/useShowApiError';
import { api } from '@/lib/api';

import { StaffQueryKey } from '../types/StaffQueryKey';

type UpdateStaffVariables = { id: string; input: UpdateStaffRequest };
type UpdateStaffStatusVariables = { id: string; input: UpdateStaffStatusRequest };

/** One page of staff accounts; the previous page stays visible while the next one loads. */
export function useStaffList(
  query: StaffListQuery,
  enabled: boolean,
): UseQueryResult<StaffListResponse> {
  return useQuery({
    queryKey: [StaffQueryKey.Staff, query],
    queryFn: async (): Promise<StaffListResponse> => {
      const response = await api.get('/users/staff', { params: query });
      return staffListResponseSchema.parse(response.data);
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Roles the current user may assign. Only fetched for users who can manage staff. */
export function useStaffRoles(enabled: boolean): UseQueryResult<StaffRolesResponse> {
  return useQuery({
    queryKey: [StaffQueryKey.Roles],
    queryFn: async (): Promise<StaffRolesResponse> => {
      const response = await api.get('/users/staff/roles');
      return staffRolesResponseSchema.parse(response.data);
    },
    enabled,
  });
}

export function useCreateStaff(): UseMutationResult<
  CreateStaffResponse,
  Error,
  CreateStaffRequest
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to create the staff account.');

  return useMutation<CreateStaffResponse, Error, CreateStaffRequest>({
    mutationFn: async (input: CreateStaffRequest): Promise<CreateStaffResponse> => {
      const response = await api.post('/users/staff', input);
      return createStaffResponseSchema.parse(response.data);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [StaffQueryKey.Staff] }),
    onError: showApiError,
  });
}

export function useUpdateStaff(): UseMutationResult<StaffAccount, Error, UpdateStaffVariables> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to update the staff account.');

  return useMutation<StaffAccount, Error, UpdateStaffVariables>({
    mutationFn: async ({ id, input }: UpdateStaffVariables): Promise<StaffAccount> => {
      const response = await api.patch(`/users/staff/${id}`, input);
      return staffAccountSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [StaffQueryKey.Staff] }),
    onError: showApiError,
  });
}

export function useUpdateStaffStatus(): UseMutationResult<
  StaffAccount,
  Error,
  UpdateStaffStatusVariables
> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to change the account status.');

  return useMutation<StaffAccount, Error, UpdateStaffStatusVariables>({
    mutationFn: async ({ id, input }: UpdateStaffStatusVariables): Promise<StaffAccount> => {
      const response = await api.patch(`/users/staff/${id}/status`, input);
      return staffAccountSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [StaffQueryKey.Staff] }),
    onError: showApiError,
  });
}

export function useResendStaffInvite(): UseMutationResult<StaffEmailActionResponse, Error, string> {
  const queryClient = useQueryClient();
  const showApiError = useShowApiError('Unable to resend the staff invitation.');

  return useMutation<StaffEmailActionResponse, Error, string>({
    mutationFn: async (id: string): Promise<StaffEmailActionResponse> => {
      const response = await api.post(`/users/staff/${id}/resend-invite`);
      return staffEmailActionResponseSchema.parse(response.data);
    },
    retry: false,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [StaffQueryKey.Staff] }),
    onError: showApiError,
  });
}

export function useSendStaffPasswordReset(): UseMutationResult<
  StaffEmailActionResponse,
  Error,
  string
> {
  const showApiError = useShowApiError('Unable to send the password reset email.');
  return useMutation<StaffEmailActionResponse, Error, string>({
    mutationFn: async (id: string): Promise<StaffEmailActionResponse> => {
      const response = await api.post(`/users/staff/${id}/send-password-reset`);
      return staffEmailActionResponseSchema.parse(response.data);
    },
    retry: false,
    onError: showApiError,
  });
}
