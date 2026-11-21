'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';

import usePermissions from '@/hooks/auth/usePermissions';

import { SETTINGS_NAV_GROUPS } from '../../app/(protected)/restaurant/settings/settings-nav';

export default function SettingsLayoutClient({ children }: { children: ReactNode }): ReactElement {
  const pathname = usePathname();
  const { can } = usePermissions();
  const groups = SETTINGS_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 sm:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-[32px]">
          Restaurant settings
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Set up your restaurant once — floor, menu structure, team and billing rules.
        </p>
      </div>

      {/* 2-column layout */}
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-10">
        <aside className="w-full shrink-0 md:w-56" aria-label="Settings navigation">
          <nav className="flex flex-col gap-6">
            {groups.map((group) => (
              <div key={group.label} className="flex flex-col gap-1">
                <div className="px-3 pb-1 text-xs font-normal uppercase tracking-wider text-muted-foreground select-none">
                  {group.label}
                </div>
                {group.items.map(({ label, href }) => {
                  const active =
                    pathname === href ||
                    (pathname === '/restaurant/settings' &&
                      href === '/restaurant/settings/general') ||
                    pathname.startsWith(`${href}/`);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                        active
                          ? 'bg-muted font-semibold text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                      )}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Content area */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
