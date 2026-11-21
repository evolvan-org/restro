'use client';

import { Permission } from '@rms/permissions';
import { Eye, Lock, Plus, Search } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import { MATRIX_KEYS } from '@/lib/permission-labels';
import { formatRoleLabel } from '@/lib/utils';
import { useRoles, useSaveRolePermissions } from '@/services/api/requests/roles';

import MobileRoles from './MobileRoles';
import PermissionMatrix from './PermissionMatrix';
import RoleDetailsPanel from './RoleDetailsPanel';
import { DeleteRoleModal, NewRoleModal, ReviewChangesModal } from './RoleModals';
import { useRoleDraft } from './roles-model';

const DEFAULT_EXPANDED = ['Floor', 'Billing'];

export default function Roles(): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.ROLE_READ]);
  const rolesQuery = useRoles(isAllowed);
  const roles = rolesQuery.data?.items ?? [];
  const draft = useRoleDraft(roles);
  const save = useSaveRolePermissions();

  const [search, setSearch] = useState('');
  const [diffOnly, setDiffOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(DEFAULT_EXPANDED));
  const [openRoleId, setOpenRoleId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [newRole, setNewRole] = useState<{ sourceId?: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const hasChanges = draft.changes.length > 0;
  useEffect(() => {
    if (!hasChanges) return undefined;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);

  if (!isAllowed) return null;
  if (!rolesQuery.data) {
    return (
      <p
        className={
          rolesQuery.isError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
        }
      >
        {rolesQuery.isError ? 'Unable to load roles.' : 'Loading roles…'}
      </p>
    );
  }

  const { grantable, actorRoleId, actorRoleName, canWrite } = rolesQuery.data;
  const grantableSet = new Set<string>(grantable);
  const openRole = roles.find((role) => role.id === openRoleId);
  const deletingRole = roles.find((role) => role.id === deletingId);
  const matrixProps = {
    roles,
    draft,
    grantable: grantableSet,
    canWrite,
    actorRoleId,
    actorRoleName,
  };

  function saveChanges(): void {
    save.mutate(
      {
        changes: draft.changes.map((c) => ({
          roleId: c.role.id,
          permissions: [...draft.effective(c.role.id)] as never[],
        })),
      },
      {
        onSuccess: () => {
          toast.success(
            `Saved changes to ${draft.changes.length} ${draft.changes.length === 1 ? 'role' : 'roles'}`,
          );
          draft.discard();
          setReviewing(false);
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-5 pb-24">
      <div className="hidden flex-col gap-5 md:flex">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Roles &amp; permissions
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {roles.length} roles · {MATRIX_KEYS.length} permissions · click a role name for
              details, users and delete
            </p>
          </div>
          {canWrite && (
            <Button onClick={() => setNewRole({})}>
              <Plus className="size-4" /> New role
            </Button>
          )}
        </div>

        {!canWrite && (
          <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
            <Eye className="size-4" aria-hidden />
            <span>
              View only. You need <strong>Manage roles</strong> to change permissions.
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              className="pl-9"
              placeholder="Search permissions"
              aria-label="Search permissions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div
            className="inline-flex rounded-lg border border-border p-0.5"
            role="group"
            aria-label="Rows"
          >
            {[
              { label: 'All rows', value: false },
              { label: 'Differences only', value: true },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={diffOnly === option.value}
                onClick={() => setDiffOnly(option.value)}
                className={`rounded-md px-3 py-1.5 text-sm ${diffOnly === option.value ? 'bg-muted font-medium' : 'text-muted-foreground'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            onClick={() =>
              setExpanded(
                new Set([
                  'Dashboard & reports',
                  'Floor',
                  'Reservations',
                  'Orders',
                  'Kitchen & bar (KOT)',
                  'Billing',
                  'Payments',
                  'Menu',
                  'Stock & inventory',
                  'Team & roles',
                  'Restaurant settings',
                ]),
              )
            }
          >
            Expand all
          </Button>
          <Button variant="ghost" onClick={() => setExpanded(new Set())}>
            Collapse all
          </Button>
          <span className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-3.5 rounded bg-foreground" /> Granted
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3.5 rounded border border-border" /> Not granted
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5" aria-hidden /> Not in your role
            </span>
          </span>
        </div>

        <PermissionMatrix
          {...matrixProps}
          search={search}
          diffOnly={diffOnly}
          expanded={expanded}
          onToggleGroup={(label) =>
            setExpanded((current) => {
              const next = new Set(current);
              if (!next.delete(label)) next.add(label);
              return next;
            })
          }
          onOpenRole={setOpenRoleId}
          onNewRole={() => setNewRole({})}
        />
      </div>

      <div className="md:hidden">
        <MobileRoles {...matrixProps} onNewRole={() => setNewRole({})} />
      </div>

      {hasChanges && canWrite && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-6 py-3 md:left-60">
          <p className="flex items-center gap-2 text-sm">
            <span className="size-2 rounded-full bg-orange-500" aria-hidden />
            <strong>
              {draft.totalChanges} {draft.totalChanges === 1 ? 'change' : 'changes'}
            </strong>
            <span className="hidden text-muted-foreground sm:inline">
              in {draft.changes.length} {draft.changes.length === 1 ? 'role' : 'roles'} ·{' '}
              {draft.changes.map((c) => formatRoleLabel(c.role.name)).join(', ')} · affects{' '}
              {draft.affectedUsers} staff
            </span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={draft.discard} disabled={save.isPending}>
              Discard
            </Button>
            <Button onClick={() => setReviewing(true)} disabled={save.isPending}>
              Review &amp; save
            </Button>
          </div>
        </div>
      )}

      {openRole && (
        <RoleDetailsPanel
          role={openRole}
          draft={draft}
          canWrite={canWrite}
          actorRoleId={actorRoleId}
          onClose={() => setOpenRoleId(null)}
          onDuplicate={() => {
            setOpenRoleId(null);
            setNewRole({ sourceId: openRole.id });
          }}
          onDelete={() => {
            setOpenRoleId(null);
            setDeletingId(openRole.id);
          }}
        />
      )}
      {reviewing && (
        <ReviewChangesModal
          changes={draft.changes}
          affectedUsers={draft.affectedUsers}
          saving={save.isPending}
          onBack={() => setReviewing(false)}
          onSave={saveChanges}
        />
      )}
      {newRole && (
        <NewRoleModal
          roles={roles}
          grantable={grantableSet}
          initialSourceId={newRole.sourceId}
          onClose={() => setNewRole(null)}
          onCreated={(role) => {
            toast.success(`Added ${role.name}`);
            setNewRole(null);
          }}
        />
      )}
      {deletingRole && (
        <DeleteRoleModal
          role={deletingRole}
          roles={roles}
          onClose={() => setDeletingId(null)}
          onDeleted={() => {
            toast.success(`Deleted ${formatRoleLabel(deletingRole.name)}`);
            setDeletingId(null);
          }}
        />
      )}
    </section>
  );
}
