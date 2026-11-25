import { Permission } from '@rms/permissions';

import { NAV_ITEMS } from '@/components/AppSidebar/navigation';
import usePermissions from '@/hooks/auth/usePermissions';

/**
 * Where to send a user who opened a page they cannot access: the dashboard, or — for a role without
 * dashboard access — the first sidebar page they can open, falling back to their profile (open to
 * everyone, so the redirect can never loop).
 */
export default function useAccessibleHome(): string {
  const { can } = usePermissions();
  if (can(Permission.DASHBOARD_READ)) return '/dashboard';
  const firstItem = NAV_ITEMS.find(
    (item) => item.href && (!item.permission || can(item.permission)),
  );
  return firstItem?.href ?? '/profile';
}
