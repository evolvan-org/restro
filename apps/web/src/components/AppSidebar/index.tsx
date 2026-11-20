'use client';

import { Permission } from '@rms/permissions';
import { cn } from 'cn';
import { ArrowUpRight, ChefHat, ExternalLink, GlassWater, PanelLeft, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactElement, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import usePermissions from '@/hooks/auth/usePermissions';
import { formatRoleLabel } from '@/lib/utils';
import { useSetupChecklist } from '@/services/api/requests/onboarding';
import { useProfile } from '@/services/api/requests/profile';

import { NAV_GROUPS, type NavItem } from './navigation';

const COLLAPSED_STORAGE_KEY = 'rms-sidebar-collapsed';

/** Computes initials from a display name, e.g. "Bharat V." -> "BV". */
function getInitials(name?: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
      className="flex items-center gap-2.5 font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
        R
      </span>
      {!collapsed && <span className="truncate text-sm font-semibold">Restaurant MS</span>}
    </Link>
  );
}

/**
 * Grouped navigation links, gated by permission and rendered only for modules that have a live page.
 * Shared by the desktop rail and the mobile drawer.
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
  const missingRecipes =
    useSetupChecklist(can(Permission.MENU_WRITE)).data?.missingRecipeCount ?? 0;

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item): item is NavItem & { href: string } =>
        Boolean(item.href) && (!item.permission || can(item.permission)),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col overflow-y-auto px-3 py-2">
      {visibleGroups.map((group, groupIdx) => {
        const groupKey = group.label ?? `group-${groupIdx}`;
        return (
          <div key={groupKey} className={cn(groupIdx > 0 && (group.label ? 'mt-5' : 'mt-1'))}>
            {collapsed ? (
              groupIdx > 0 ? (
                <div className="my-2 mx-1 border-t border-sidebar-border/60" aria-hidden />
              ) : null
            ) : group.label ? (
              <div className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60 select-none">
                {group.label}
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              {group.items.map(({ label, icon: Icon, href, activePaths, badge }) => {
                const count = badge === 'missing-recipes' ? missingRecipes : 0;
                const active =
                  isActiveRoute(pathname, href) ||
                  Boolean(activePaths?.some((path) => isActiveRoute(pathname, path)));
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
                        ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden />
                    <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

const STATION_LINKS = [
  { label: 'Kitchen display', href: '/kitchen', icon: ChefHat },
  { label: 'Bar display', href: '/bar', icon: GlassWater },
] as const;

/** Launchers for the full-screen station displays; they always open in a new tab. */
function StationDisplayLinks({ collapsed }: { collapsed?: boolean }): ReactElement | null {
  const { can } = usePermissions();
  if (!can(Permission.KOT_READ)) return null;

  return (
    <div className="flex flex-col gap-0.5 border-b border-sidebar-border pb-2">
      {!collapsed && (
        <span className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60 select-none">
          Station displays
        </span>
      )}
      {STATION_LINKS.map(({ label, href, icon: Icon }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener"
          aria-label={`${label}, opens in a new tab`}
          title={`${label} (opens in new tab)`}
          className={cn(
            'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50',
            collapsed && 'justify-center px-0',
          )}
        >
          <Icon className="size-5 shrink-0" aria-hidden />
          {collapsed ? (
            <ArrowUpRight
              className="absolute top-1 right-1.5 size-[11px] text-sidebar-foreground/70"
              strokeWidth={3}
              aria-hidden
            />
          ) : (
            <>
              <span className="flex-1 truncate">{label}</span>
              <ExternalLink className="size-4 shrink-0 text-sidebar-foreground/60" aria-hidden />
            </>
          )}
        </a>
      ))}
    </div>
  );
}

/**
 * Sidebar footer carrying restaurant settings and the user profile summary.
 */
function SidebarFooter({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}): ReactElement {
  const pathname = usePathname();
  const { data: profile } = useProfile();
  const { can } = usePermissions();

  const canManageRestaurant = can(Permission.RESTAURANT_READ);
  const isSettingsActive = isActiveRoute(pathname, '/restaurant/settings');
  const roleLabel = profile?.role ? formatRoleLabel(profile.role) : '';
  const initials = getInitials(profile?.name);

  return (
    <div className="flex flex-col gap-1.5 border-t border-sidebar-border p-3">
      <StationDisplayLinks collapsed={collapsed} />
      {canManageRestaurant && (
        <Link
          href="/restaurant/settings"
          onClick={onNavigate}
          aria-current={isSettingsActive ? 'page' : undefined}
          title={collapsed ? 'Restaurant settings' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sidebar-ring/50',
            collapsed && 'justify-center px-0',
            isSettingsActive
              ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          )}
        >
          <Settings className="size-5 shrink-0" aria-hidden />
          <span className={cn('truncate', collapsed && 'sr-only')}>Restaurant settings</span>
        </Link>
      )}

      <Link
        href="/profile"
        onClick={onNavigate}
        title={
          collapsed
            ? `${profile?.name ?? 'Profile'}${roleLabel ? ` (${roleLabel})` : ''}`
            : undefined
        }
        className={cn(
          'flex items-center gap-3 rounded-md px-2 py-1.5 outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50',
          collapsed && 'justify-center px-0',
        )}
      >
        <span
          className="flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-foreground"
          aria-hidden
        >
          {initials}
        </span>
        {!collapsed && (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-sidebar-foreground">
              {profile?.name ?? 'User'}
            </span>
            {roleLabel && (
              <span className="truncate text-xs text-sidebar-foreground/60">{roleLabel}</span>
            )}
          </div>
        )}
      </Link>
    </div>
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
            'flex h-14 items-center px-4',
            collapsed ? 'justify-center px-0' : 'justify-between',
          )}
        >
          {collapsed ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="group relative size-8 rounded-md p-0 hover:bg-sidebar-accent"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground group-hover:hidden">
                R
              </span>
              <PanelLeft
                className="hidden size-5 text-sidebar-foreground group-hover:block"
                aria-hidden
              />
            </Button>
          ) : (
            <>
              <SidebarBrand />
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapsed}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="size-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <PanelLeft className="size-5" aria-hidden />
              </Button>
            </>
          )}
        </div>

        <SidebarNav collapsed={collapsed} />

        <SidebarFooter collapsed={collapsed} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="flex w-72 flex-col gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="h-14 justify-center px-4 pr-12">
            <SheetTitle>
              <SidebarBrand onNavigate={() => onMobileOpenChange(false)} />
            </SheetTitle>
          </SheetHeader>
          <SidebarNav onNavigate={() => onMobileOpenChange(false)} />
          <SidebarFooter onNavigate={() => onMobileOpenChange(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
