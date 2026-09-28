'use client';

import { LogOut, Menu, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { useLogout } from '@/store/hooks/auth';

/**
 * Top bar of the app shell. Primary navigation lives in the sidebar; the header carries the mobile
 * menu trigger, a page-title slot, and account actions (profile, log out). Log out removes the token
 * and returns to the login page.
 */
export default function AppHeader({ onMenuClick }: { onMenuClick: () => void }): ReactElement {
  const router = useRouter();
  const logout = useLogout();

  const handleLogout = (): void => {
    logout();
    router.replace('/auth/login');
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu aria-hidden />
      </Button>

      {/* Page-title slot — pages can fill this in a later change. */}
      <div className="flex-1" />

      <nav aria-label="Account" className="flex items-center gap-1">
        <Link href="/profile" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <User aria-hidden />
          <span className="hidden sm:inline">Profile</span>
        </Link>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut aria-hidden />
          <span className="hidden sm:inline">Log out</span>
        </Button>
      </nav>
    </header>
  );
}
