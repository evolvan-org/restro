import type { Permission } from '@rms/permissions';

import { useProfile } from '@/services/api/requests/profile';

type Permissions = {
  /** Whether the signed-in user's role grants `permission`. `false` until the profile has loaded. */
  can: (permission: Permission) => boolean;
  /** Whether the role grants at least one of `permissions`. `false` until the profile has loaded. */
  canAny: (permissions: readonly Permission[]) => boolean;
  isLoading: boolean;
};

/**
 * UI gating only: uses the permission list the API resolved for the signed-in user (from their
 * role's grants, or every key for the Owner) so pages can hide what the API would reject. The API
 * remains the source of enforcement.
 */
export default function usePermissions(): Permissions {
  const { data: profile, isPending } = useProfile();
  const granted = profile?.permissions;

  return {
    can: (permission) => granted?.includes(permission) ?? false,
    canAny: (permissions) => permissions.some((p) => granted?.includes(p) ?? false),
    isLoading: isPending,
  };
}
