import { Lock } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MATRIX_KEYS } from '@/lib/permission-labels';
import { formatRoleLabel } from '@/lib/utils';
import { useRole } from '@/services/api/requests/roles';

import { defaultPermissionsOf, matrixCount, type RoleDraft, type RoleItem } from './roles-model';

const TEAM_PATH = '/restaurant/settings/team';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function RoleDetailsPanel({
  role,
  draft,
  canWrite,
  actorRoleId,
  onClose,
  onDuplicate,
  onDelete,
}: {
  role: RoleItem;
  draft: RoleDraft;
  canWrite: boolean;
  actorRoleId: string;
  onClose: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}): ReactElement {
  const detail = useRole(role.id);
  const users = detail.data?.users ?? [];
  const label = formatRoleLabel(role.name);
  const defaults = defaultPermissionsOf(role);
  const isOwnRole = role.id === actorRoleId;
  const editable = canWrite && !role.isOwner && !isOwnRole;
  const granted = matrixCount(draft.effective(role.id));

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Role details
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-5 overflow-auto p-5">
          <div className="flex items-start gap-3">
            {role.isOwner && (
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
                <Lock className="size-4" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground">
                {label}
                <Badge variant="secondary">
                  {role.isOwner ? 'Locked' : role.isSystem ? 'System' : 'Custom'}
                </Badge>
              </h3>
              {role.description && (
                <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
              )}
            </div>
          </div>

          {role.isOwner && (
            <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
              Owners skip every permission check, so the Owner column has no checkboxes. This role
              can&apos;t be renamed, edited, duplicated or deleted, and the restaurant always keeps
              at least one active Owner.
            </p>
          )}

          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-medium text-foreground">
                People with this role{role.isOwner ? ` · ${role.userCount}` : ''}
              </span>
              <Link href={TEAM_PATH} className="text-foreground underline underline-offset-2">
                Team page →
              </Link>
            </div>
            {role.isOwner ? (
              <ul className="divide-y divide-border border-t border-border">
                {users.map((user) => (
                  <li key={user.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs">
                      {initials(user.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {user.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </span>
                    <Badge variant={user.status === 'ACTIVE' ? 'active' : 'inactive'}>
                      {user.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-2 px-4 pb-3 text-sm text-muted-foreground">
                <span className="flex -space-x-1.5">
                  {users.slice(0, 3).map((user) => (
                    <span
                      key={user.id}
                      title={user.name}
                      className="flex size-6 items-center justify-center rounded-full border border-background bg-muted text-[10px]"
                    >
                      {initials(user.name)}
                    </span>
                  ))}
                  {role.userCount > 3 && (
                    <span className="flex size-6 items-center justify-center rounded-full border border-background bg-muted text-[10px]">
                      +{role.userCount - 3}
                    </span>
                  )}
                </span>
                {role.userCount === 0
                  ? 'No staff yet'
                  : `${role.userCount} staff ${role.userCount === 1 ? 'member' : 'members'}`}
              </div>
            )}
          </div>

          {!role.isOwner && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Permissions</span>
                <span className="font-medium text-foreground">
                  {granted} of {MATRIX_KEYS.length}
                </span>
              </div>
              {canWrite && (
                <div className="flex flex-col gap-2">
                  {defaults && (
                    <Button
                      variant="outline"
                      className="justify-start"
                      disabled={!editable}
                      onClick={() => {
                        draft.stage(role.id, defaults);
                        onClose();
                      }}
                    >
                      Reset to default
                    </Button>
                  )}
                  <Button variant="outline" className="justify-start" onClick={onDuplicate}>
                    Duplicate role
                  </Button>
                  {!role.isSystem && (
                    <Button
                      variant="outline"
                      className="justify-start text-destructive"
                      disabled={!editable}
                      onClick={onDelete}
                    >
                      Delete role
                    </Button>
                  )}
                </div>
              )}
              {role.isSystem ? (
                <p className="text-xs text-muted-foreground">
                  System roles can&apos;t be deleted. Reset to default restores the original
                  permissions, as pending changes you review and save.
                </p>
              ) : (
                isOwnRole && (
                  <p className="text-xs text-muted-foreground">
                    You can&apos;t edit your own role.
                  </p>
                )
              )}
            </>
          )}
          {role.isOwner && (
            <p className="text-xs text-muted-foreground">
              Only an Account Owner can make someone else an Owner, from the Team page. Removing or
              demoting the last active Owner is blocked.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
