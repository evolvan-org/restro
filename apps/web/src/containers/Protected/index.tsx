'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactElement, type ReactNode, useEffect, useState } from 'react';

import AppHeader from '@/components/AppHeader';
import AppSidebar from '@/components/AppSidebar';
import EmailVerificationBanner from '@/components/EmailVerificationBanner';
import useAppLayout from '@/hooks/useAppLayout';
import { useProfile } from '@/services/api/requests/profile';
import { useAccessToken } from '@/store/hooks/auth';

/**
 * Shell for every signed-in route (`app/(protected)/`). Without an access token the page is not
 * rendered and the user is sent to the login page — this covers logout, a 401 from the API
 * (the axios interceptor clears the token) and a refresh after logout, since the persisted
 * auth state is restored before rendering.
 *
 * `useAppLayout` decides whether the route gets the full app shell (sidebar + header) or renders
 * bare (e.g. `/forbidden`). The decision lives in that hook, not here — see its `BARE_ROUTES`.
 */
export default function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement | null {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useAccessToken();
  const { variant } = useAppLayout();
  const profile = useProfile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/auth/login');
    }
  }, [accessToken, router]);

  // An account that isn't fully set up can only be on its setup routes: a one-time password must
  // be replaced first, and an owner whose restaurant isn't finished goes through onboarding.
  const setupRedirect = ((): string | null => {
    if (!profile.data) return null;
    if (profile.data.mustChangePassword) {
      return pathname === '/change-password' ? null : '/change-password';
    }
    if (profile.data.onboarding === 'PENDING' && !pathname.startsWith('/onboarding')) {
      return '/onboarding';
    }
    return null;
  })();
  useEffect(() => {
    if (accessToken && setupRedirect) router.replace(setupRedirect);
  }, [accessToken, setupRedirect, router]);

  // Close the mobile drawer on any route change, including back-navigation that bypasses link clicks.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (!accessToken) {
    return null;
  }

  if (variant === 'bare') {
    return setupRedirect ? null : <>{children}</>;
  }

  // Wait for the profile so a pending owner never sees the app shell (or its 403 toasts) first.
  if (setupRedirect || (profile.isPending && !profile.isError)) {
    return null;
  }

  return (
    <div className="flex min-h-svh">
      <AppSidebar mobileOpen={mobileNavOpen} onMobileOpenChange={setMobileNavOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onMenuClick={() => setMobileNavOpen(true)} />
        <EmailVerificationBanner />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
