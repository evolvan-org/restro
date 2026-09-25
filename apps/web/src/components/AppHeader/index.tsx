'use client';

import { Permission } from '@rms/permissions';
import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import usePermissions from '@/hooks/auth/usePermissions';
import { useLogout } from '@/store/hooks/auth';

type NavLink = { href: string; label: string; permission?: Permission };

const NAV_LINKS: readonly NavLink[] = [
  { href: '/profile', label: 'Profile' },
  { href: '/staff', label: 'Staff', permission: Permission.USER_READ },
];

/** Top navigation for signed-in pages. Log out removes the token and returns to the login page. */
export default function AppHeader(): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();
  const { can } = usePermissions();
  const visibleLinks = NAV_LINKS.filter((link) => !link.permission || can(link.permission));

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
            {visibleLinks.map(({ href, label }) => (
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
