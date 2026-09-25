'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { useLogout } from '@/store/hooks/auth';

const NAV_LINKS = [{ href: '/profile', label: 'Profile' }] as const;

/** Top navigation for signed-in pages. Log out removes the token and returns to the login page. */
export default function AppHeader(): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();

  const handleLogout = (): void => {
    logout();
    router.replace('/auth/login');
  };

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Restaurant Management System
          </Link>
          <nav aria-label="Main" className="flex items-center gap-4 text-sm">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? 'page' : undefined}
                className={
                  pathname === href
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut aria-hidden />
          Log out
        </Button>
      </div>
    </header>
  );
}
