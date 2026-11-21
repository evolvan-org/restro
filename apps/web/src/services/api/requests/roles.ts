import {
  type CreateRoleRequest,
  type RoleAuditListResponse,
  roleAuditListResponseSchema,
  type RoleDetail,
  roleDetailSchema,
  type RoleListResponse,
  roleListResponseSchema,
  type UpdateRoleRequest,
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

type UpdateRoleVariables = { id: string; input: UpdateRoleRequest };
type DeleteRoleVariables = { id: string; reassignToRoleId?: string };

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

export function useRole(id: string | undefined, enabled: boolean): UseQueryResult<RoleDetail> {
  return useQuery({
    queryKey: [RolesQueryKey.Role, id],
    queryFn: async (): Promise<RoleDetail> => {
      const response = await api.get(`/roles/${id}`);
      return roleDetailSchema.parse(response.data);
    },
    enabled: enabled && Boolean(id),
  });
}

export function useRoleAudit(enabled: boolean): UseQueryResult<RoleAuditListResponse> {
  return useQuery({
    queryKey: [RolesQueryKey.Audit],
    queryFn: async (): Promise<RoleAuditListResponse> => {
      const response = await api.get('/roles/audit');
      return roleAuditListResponseSchema.parse(response.data);
    },
    enabled,
  });
}

/** Role changes affect staff pickers, profiles and the audit trail, so refresh all of them. */
function useInvalidateRoles(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [RolesQueryKey.Roles] }),
      queryClient.invalidateQueries({ queryKey: [RolesQueryKey.Role] }),
      queryClient.invalidateQueries({ queryKey: [RolesQueryKey.Audit] }),
      queryClient.invalidateQueries({ queryKey: [StaffQueryKey.Roles] }),
      queryClient.invalidateQueries({ queryKey: [StaffQueryKey.Staff] }),
    ]);
  };
}

export function useCreateRole(): UseMutationResult<RoleDetail, Error, CreateRoleRequest> {
  const invalidate = useInvalidateRoles();
  const showApiError = useShowApiError('Unable to create the role.');
  return useMutation<RoleDetail, Error, CreateRoleRequest>({
    mutationFn: async (input) => roleDetailSchema.parse((await api.post('/roles', input)).data),
    onSuccess: invalidate,
    onError: showApiError,
  });
}

export function useUpdateRole(): UseMutationResult<RoleDetail, Error, UpdateRoleVariables> {
  const invalidate = useInvalidateRoles();
  const showApiError = useShowApiError('Unable to update the role.');
  return useMutation<RoleDetail, Error, UpdateRoleVariables>({
    mutationFn: async ({ id, input }) =>
      roleDetailSchema.parse((await api.patch(`/roles/${id}`, input)).data),
    onSuccess: invalidate,
    onError: showApiError,
  });
}

export function useResetRole(): UseMutationResult<RoleDetail, Error, string> {
  const invalidate = useInvalidateRoles();
  const showApiError = useShowApiError('Unable to reset the role.');
  return useMutation<RoleDetail, Error, string>({
    mutationFn: async (id) => roleDetailSchema.parse((await api.post(`/roles/${id}/reset`)).data),
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
