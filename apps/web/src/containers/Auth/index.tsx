'use client';

import type { ReactNode } from 'react';

/**
 * Shared shell for every /auth route. Centers the auth card so each auth page
 * (login, and future register / forgot-password / …) only renders its own
 * content. Mounted from the auth-root layout at `app/auth/layout.tsx`.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
