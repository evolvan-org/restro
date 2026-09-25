import {
  createStaffResponseSchema,
  staffAccountSchema,
  staffListResponseSchema,
  staffRolesResponseSchema,
  type CreateStaffRequest,
  type CreateStaffResponse,
  type StaffAccount,
  type StaffListQuery,
  type StaffListResponse,
  type StaffRolesResponse,
  type UpdateStaffRequest,
  type UpdateStaffStatusRequest,
} from '@rms/api-contract';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
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
      const response = await api.get('/staff', { params: query });
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
      const response = await api.get('/staff/roles');
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

  return useMutation({
    mutationFn: async (input: CreateStaffRequest): Promise<CreateStaffResponse> => {
      const response = await api.post('/staff', input);
      return createStaffResponseSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [StaffQueryKey.Staff] }),
  });
}

export function useUpdateStaff(): UseMutationResult<StaffAccount, Error, UpdateStaffVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: UpdateStaffVariables): Promise<StaffAccount> => {
      const response = await api.patch(`/staff/${id}`, input);
      return staffAccountSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [StaffQueryKey.Staff] }),
  });
}

export function useUpdateStaffStatus(): UseMutationResult<
  StaffAccount,
  Error,
  UpdateStaffStatusVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: UpdateStaffStatusVariables): Promise<StaffAccount> => {
      const response = await api.patch(`/staff/${id}/status`, input);
      return staffAccountSchema.parse(response.data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [StaffQueryKey.Staff] }),
  });
}
