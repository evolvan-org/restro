'use client';

import { useRouter } from 'next/navigation';
import { type ReactElement, type ReactNode, useEffect } from 'react';

import AppHeader from '@/components/AppHeader';
import { useAccessToken } from '@/store/hooks/auth';

/**
 * Shell for every signed-in route (`app/(protected)/`). Without an access token the page is not
 * rendered and the user is sent to the login page — this covers logout, a 401 from the API
 * (the axios interceptor clears the token) and a refresh after logout, since the persisted
 * auth state is restored before rendering.
 */
export default function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement | null {
  const router = useRouter();
  const accessToken = useAccessToken();

  useEffect(() => {
    if (!accessToken) {
      router.replace('/auth/login');
    }
  }, [accessToken, router]);

  if (!accessToken) {
    return null;
  }

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <div className="flex-1">{children}</div>
    </div>
  );
}
