'use client';

import { LogOut, Menu, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactElement } from 'react';

import NotificationBell from '@/components/NotificationBell';
import StaffPreferences, { useStaffLanguage } from '@/components/StaffPreferences';
import { Button, buttonVariants } from '@/components/ui/button';
import { useLogout } from '@/store/hooks/auth';

const SETTINGS_TAB_LABELS: Record<string, string> = {
  general: 'General',
  team: 'Team',
  'dining-sections': 'Dining sections',
  tables: 'Tables',
  'table-statuses': 'Table statuses',
  'menu-categories': 'Menu categories',
  'tax-discounts': 'Tax & discounts',
  'cancellation-reasons': 'Cancellation reasons',
  'qr-ordering': 'QR ordering',
  printing: 'Thermal printing',
};

/**
 * Top bar of the app shell. Primary navigation lives in the sidebar; the header carries the mobile
 * menu trigger, a page-title slot, and account actions (profile, log out). Log out removes the token
 * and returns to the login page.
 */
export default function AppHeader({ onMenuClick }: { onMenuClick: () => void }): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();
  const t = useStaffLanguage();

  const handleLogout = (): void => {
    logout();
    router.replace('/auth/login');
  };

  const isRestaurantSettings = pathname.startsWith('/restaurant/settings');
  const settingsSegment = isRestaurantSettings
    ? pathname.replace('/restaurant/settings', '').replace(/^\//, '').split('/')[0]
    : '';
  const currentSettingsTab =
    (settingsSegment ? SETTINGS_TAB_LABELS[settingsSegment] : undefined) ?? 'General';

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={onMenuClick}
        aria-label={t('Open navigation')}
      >
        <Menu aria-hidden />
      </Button>

      {/* Page-title slot — renders breadcrumb for settings, or empty slot */}
      {isRestaurantSettings ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm">
          <Link
            href="/restaurant/settings"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('Restaurant settings')}
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <span className="font-semibold text-foreground">{t(currentSettingsTab)}</span>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <nav aria-label={t('Account')} className="flex items-center gap-1">
        <StaffPreferences />
        <NotificationBell />
        {!isRestaurantSettings && (
          <>
            <Link href="/profile" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              <User aria-hidden />
              <span className="hidden sm:inline">{t('Profile')}</span>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut aria-hidden />
              <span className="hidden sm:inline">{t('Log out')}</span>
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}
