'use client';

import type { Permission } from '@rms/permissions';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import useAccessibleHome from '@/hooks/auth/useAccessibleHome';
import usePermissions from '@/hooks/auth/usePermissions';

/**
 * Page-level route guard. The user is allowed if their role grants at least one of `permissions`
 * (OR semantics). While the role is still loading the page should render nothing; once loaded, a
 * user without any of the permissions is redirected to the dashboard (or the nearest page they can
 * open).
 *
 * Usage: `const isAllowed = usePermissionGuard([Permission.USER_READ]); if (!isAllowed) return null;`
 */
export default function usePermissionGuard(permissions: readonly Permission[]): boolean {
  const router = useRouter();
  const { canAny, isLoading } = usePermissions();
  const allowed = canAny(permissions);
  const home = useAccessibleHome();

  useEffect(() => {
    if (!isLoading && !allowed) {
      router.replace(home);
    }
  }, [isLoading, allowed, home, router]);

  return !isLoading && allowed;
}
