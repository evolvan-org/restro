import {
  type CreateRoleRequest,
  type RoleDetail,
  roleDetailSchema,
  type RoleListResponse,
  roleListResponseSchema,
  type UpdateRolePermissionsRequest,
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

import { RolesQueryKey } from '../types/RolesQueryKey';
import { StaffQueryKey } from '../types/StaffQueryKey';

type DeleteRoleVariables = { id: string; reassignToRoleId?: string };

/** Every role with its permissions, plus what the caller may grant. */
export function useRoles(enabled: boolean): UseQueryResult<RoleListResponse> {
  return useQuery({
    queryKey: [RolesQueryKey.Roles],
    queryFn: async (): Promise<RoleListResponse> => {
      const response = await api.get('/roles');
      return roleListResponseSchema.parse(response.data);
    },
    enabled,
  });
}

/** One role with the people who hold it, for the details panel. */
export function useRole(id: string | undefined): UseQueryResult<RoleDetail> {
  return useQuery({
    queryKey: [RolesQueryKey.Role, id],
    queryFn: async (): Promise<RoleDetail> => {
      const response = await api.get(`/roles/${id}`);
      return roleDetailSchema.parse(response.data);
    },
    enabled: Boolean(id),
  });
}

/** Role changes affect staff pickers, profiles and the detail panel, so refresh all of them. */
function useInvalidateRoles(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [RolesQueryKey.Roles] }),
      queryClient.invalidateQueries({ queryKey: [RolesQueryKey.Role] }),
      queryClient.invalidateQueries({ queryKey: [StaffQueryKey.Roles] }),
      queryClient.invalidateQueries({ queryKey: [StaffQueryKey.Staff] }),
    ]);
  };
}

/** Errors are shown inline by the caller (e.g. "name already exists"), not as a toast. */
export function useCreateRole(): UseMutationResult<RoleDetail, Error, CreateRoleRequest> {
  const invalidate = useInvalidateRoles();
  return useMutation<RoleDetail, Error, CreateRoleRequest>({
    mutationFn: async (input) => roleDetailSchema.parse((await api.post('/roles', input)).data),
    onSuccess: invalidate,
  });
}

/** Saves the permission edits of several roles at once, all or nothing. */
export function useSaveRolePermissions(): UseMutationResult<
  RoleListResponse,
  Error,
  UpdateRolePermissionsRequest
> {
  const invalidate = useInvalidateRoles();
  const showApiError = useShowApiError('Unable to save the changes.');
  return useMutation<RoleListResponse, Error, UpdateRolePermissionsRequest>({
    mutationFn: async (input) =>
      roleListResponseSchema.parse((await api.patch('/roles/permissions', input)).data),
    onSuccess: invalidate,
    onError: showApiError,
  });
}

export function useDeleteRole(): UseMutationResult<void, Error, DeleteRoleVariables> {
  const invalidate = useInvalidateRoles();
  const showApiError = useShowApiError('Unable to delete the role.');
  return useMutation<void, Error, DeleteRoleVariables>({
    mutationFn: async ({ id, reassignToRoleId }) => {
      await api.delete(`/roles/${id}`, { params: { reassignToRoleId } });
    },
    onSuccess: invalidate,
    onError: showApiError,
  });
}
