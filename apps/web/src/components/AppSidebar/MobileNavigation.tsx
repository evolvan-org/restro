'use client';

import { Ellipsis } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';

import { useStaffLanguage } from '@/components/StaffPreferences';
import usePermissions from '@/hooks/auth/usePermissions';

import { NAV_ITEMS } from './navigation';

const shortcuts = ['/dashboard', '/orders', '/reservations', '/billing'];

export default function MobileNavigation({ onMore }: { onMore: () => void }): ReactElement {
  const pathname = usePathname();
  const { can } = usePermissions();
  const t = useStaffLanguage();
  const items = shortcuts
    .map((href) => NAV_ITEMS.find((item) => item.href === href))
    .filter((item) => item && (!item.permission || can(item.permission)))
    .slice(0, 4);

  return (
    <nav
      aria-label={t('Primary')}
      className="fixed inset-x-0 bottom-0 z-30 flex min-h-16 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        if (!item?.href) return null;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-xs ${active ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
          >
            <item.icon className="size-5 shrink-0" aria-hidden />
            <span className="max-w-full truncate">{t(item.label)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className="flex flex-1 flex-col items-center justify-center gap-1 px-1 text-xs text-muted-foreground"
      >
        <Ellipsis className="size-5 shrink-0" aria-hidden />
        {t('More')}
      </button>
    </nav>
  );
}
