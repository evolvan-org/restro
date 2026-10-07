'use client';

import { Permission } from '@rms/permissions';
import {
  ArrowRight,
  CalendarCheck,
  ChefHat,
  ClipboardList,
  type LucideIcon,
  Receipt,
  Settings,
  User,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { useProfile } from '@/services/api/requests/profile';

type Module = {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Shown only when the role holds this permission. Omit for modules everyone can see. */
  permission?: Permission;
  /** Present when the module has a live page; omitted modules render as "coming soon". */
  href?: string;
};

/** Modules the dashboard surfaces, gated by permission. Order = most to least commonly used. */
const MODULES: readonly Module[] = [
  {
    title: 'Staff',
    description: 'Create accounts, assign roles, and control who can log in.',
    icon: Users,
    permission: Permission.USER_READ,
    href: '/staff',
  },
  {
    title: 'My profile',
    description: 'Update your personal details and change your password.',
    icon: User,
    href: '/profile',
  },
  {
    title: 'Reservations',
    description: 'Manage bookings and table availability.',
    icon: CalendarCheck,
    permission: Permission.RESERVATION_READ,
    href: '/reservations',
  },
  {
    title: 'Orders',
    description: 'Take and track orders across the floor.',
    icon: ClipboardList,
    permission: Permission.ORDER_READ,
  },
  {
    title: 'Kitchen display',
    description: 'Work incoming tickets and mark items ready.',
    icon: ChefHat,
    permission: Permission.KOT_READ,
  },
  {
    title: 'Billing',
    description: 'Generate bills and record payments.',
    icon: Receipt,
    permission: Permission.BILL_READ,
  },
  {
    title: 'Restaurant settings',
    description: 'Configure taxes, currency, and restaurant details.',
    icon: Settings,
    permission: Permission.RESTAURANT_WRITE,
  },
];

function ModuleCard({ module }: { module: Module }): ReactElement {
  const { icon: Icon, title, description, href } = module;

  const inner = (
    <Card
      className={
        href
          ? 'h-full transition-colors hover:border-foreground/20 hover:bg-muted/40'
          : 'h-full opacity-70'
      }
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex size-9 items-center justify-center rounded-md bg-muted text-foreground">
            <Icon className="size-5" aria-hidden />
          </div>
          {href ? (
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
          ) : (
            <Badge variant="outline">Soon</Badge>
          )}
        </div>
        <CardTitle className="mt-3">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );

  if (!href) {
    return inner;
  }

  return (
    <Link
      href={href}
      className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {inner}
    </Link>
  );
}

export default function Dashboard(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.DASHBOARD_READ]);
  const { canAny } = usePermissions();
  const { data: profile } = useProfile();

  if (!isAllowed) {
    return null;
  }

  const visibleModules = MODULES.filter(
    (module) => !module.permission || canAny([module.permission]),
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">Dashboard</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {profile?.name ? `Welcome back, ${profile.name}` : 'Welcome back'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Jump into the tools your role gives you access to.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleModules.map((module) => (
          <ModuleCard key={module.title} module={module} />
        ))}
      </div>
    </main>
  );
}
