'use client';

import { cn } from 'cn';
import { PanelLeft, PanelLeftClose } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactElement, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import usePermissions from '@/hooks/auth/usePermissions';

import { NAV_ITEMS, type NavItem } from './navigation';

const COLLAPSED_STORAGE_KEY = 'rms-sidebar-collapsed';

/** A nav item is active on its own route and any nested route beneath it. */
function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The brand lockup, shared by the desktop rail and the mobile drawer. */
function SidebarBrand({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}): ReactElement {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      title="Restaurant Management System"
      className="flex items-center gap-2 font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
        R
      </span>
      {!collapsed && <span className="truncate text-sm">Restaurant MS</span>}
    </Link>
  );
}

/**
 * The list of module links, gated by permission and rendered only for modules that have a live page.
 * Shared by the desktop rail and the mobile drawer so links are never duplicated across the two.
 */
function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}): ReactElement {
  const pathname = usePathname();
  const { can } = usePermissions();

  const visibleItems = NAV_ITEMS.filter(
    (item): item is NavItem & { href: string } =>
      Boolean(item.href) && (!item.permission || can(item.permission)),
  );

  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
      {visibleItems.map(({ label, icon: Icon, href }) => {
        const active = isActiveRoute(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? label : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sidebar-ring/50',
              collapsed && 'justify-center px-0',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Persistent left navigation for the app shell. A collapsible icon rail on desktop (the collapsed
 * state is remembered), and a slide-in drawer on mobile driven by the header's menu button.
 */
export default function AppSidebar({
  mobileOpen,
  onMobileOpenChange,
}: {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}): ReactElement {
  // Start expanded so the server and first client render agree; restore the stored preference after
  // mount to avoid a hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (stored !== null) {
      setCollapsed(stored === 'true');
    }
  }, []);

  const toggleCollapsed = (): void => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <>
      <aside
        data-collapsed={collapsed}
        className={cn(
          'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
          collapsed ? 'md:w-16' : 'md:w-64',
        )}
      >
        <div
          className={cn(
            'flex h-14 items-center border-b border-sidebar-border px-4',
            collapsed && 'justify-center px-0',
          )}
        >
          <SidebarBrand collapsed={collapsed} />
        </div>

        <SidebarNav collapsed={collapsed} />

        <div className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'w-full text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              collapsed ? 'justify-center px-0' : 'justify-start',
            )}
          >
            {collapsed ? (
              <PanelLeft aria-hidden />
            ) : (
              <>
                <PanelLeftClose aria-hidden />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="h-14 justify-center border-b border-sidebar-border px-4 pr-12">
            <SheetTitle>
              <SidebarBrand onNavigate={() => onMobileOpenChange(false)} />
            </SheetTitle>
          </SheetHeader>
          <SidebarNav onNavigate={() => onMobileOpenChange(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
