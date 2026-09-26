import { isRole, type Permission, roleHasPermission } from '@rms/permissions';

import { useProfile } from '@/services/api/requests/profile';

type Permissions = {
  /** Whether the signed-in user's role grants `permission`. `false` until the role has loaded. */
  can: (permission: Permission) => boolean;
  isLoading: boolean;
};

/**
 * UI gating only: mirrors the `@rms/permissions` policy for the signed-in user's role so pages
 * can hide what the API would reject. The API remains the source of enforcement.
 */
export default function usePermissions(): Permissions {
  const { data: profile, isPending } = useProfile();
  const role = profile?.role;

  return {
    can: (permission) => role !== undefined && isRole(role) && roleHasPermission(role, permission),
    isLoading: isPending,
  };
}
