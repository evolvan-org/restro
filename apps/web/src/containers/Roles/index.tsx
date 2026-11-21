'use client';

import { Permission } from '@rms/permissions';
import { Lock, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { formatRoleLabel } from '@/lib/utils';
import { useRoleAudit, useRoles } from '@/services/api/requests/roles';

export default function Roles(): ReactElement | null {
  const router = useRouter();
  const isAllowed = usePermissionGuard([Permission.ROLE_READ]);
  const { can } = usePermissions();
  const canWrite = can(Permission.ROLE_WRITE);
  const roles = useRoles(isAllowed);
  const audit = useRoleAudit(isAllowed);

  if (!isAllowed) return null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Roles</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose what each role can see and do. Changes apply on the person&apos;s next request.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => router.push('/restaurant/settings/roles/new')}>
            <Plus className="size-4" /> New role
          </Button>
        )}
      </div>

      {roles.isError && (
        <p role="alert" className="text-sm text-destructive">
          Unable to load roles.
        </p>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {(roles.data?.items ?? []).map((role) => (
          <li key={role.id}>
            <Link
              href={`/restaurant/settings/roles/${role.id}`}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50"
            >
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  {role.isOwner && <Lock className="size-3.5" aria-label="Locked" />}
                  {formatRoleLabel(role.name)}
                  {role.isSystem && <Badge variant="secondary">Default</Badge>}
                </span>
                {role.description && (
                  <span className="truncate text-sm text-muted-foreground">{role.description}</span>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {role.isOwner ? 'All permissions' : `${role.permissionCount} permissions`} ·{' '}
                {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Recent changes</h3>
        {(audit.data?.items ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No role changes yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {audit.data?.items.slice(0, 10).map((entry) => (
              <li key={entry.id} className="text-muted-foreground">
                <span className="text-foreground">{entry.actorName ?? 'Someone'}</span>{' '}
                {entry.action.toLowerCase()} {formatRoleLabel(entry.roleName)}
                {entry.addedKeys.length > 0 && ` · +${entry.addedKeys.length}`}
                {entry.removedKeys.length > 0 && ` · −${entry.removedKeys.length}`} ·{' '}
                {new Date(entry.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
