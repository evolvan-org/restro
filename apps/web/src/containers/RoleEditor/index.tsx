'use client';

import type { RoleDetail } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import usePermissionGuard from '@/hooks/auth/usePermissionGuard';
import usePermissions from '@/hooks/auth/usePermissions';
import { PERMISSION_GROUPS } from '@/lib/permission-labels';
import { formatRoleLabel } from '@/lib/utils';
import {
  useCreateRole,
  useDeleteRole,
  useResetRole,
  useRole,
  useRoles,
  useUpdateRole,
} from '@/services/api/requests/roles';

const LIST_PATH = '/restaurant/settings/roles';

type Props = {
  /** Editing this role; omitted when creating. */
  roleId?: string;
  /** Prefill a new role from another role's permissions. */
  duplicateFromId?: string;
};

export default function RoleEditor({ roleId, duplicateFromId }: Props): ReactElement | null {
  const isAllowed = usePermissionGuard([Permission.ROLE_READ]);
  const sourceId = roleId ?? duplicateFromId;
  const source = useRole(sourceId, isAllowed);

  if (!isAllowed) return null;
  if (sourceId && !source.data) {
    return (
      <p className={source.isError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
        {source.isError ? 'Unable to load this role.' : 'Loading…'}
      </p>
    );
  }
  // Keyed so the form state resets when the underlying role changes.
  return (
    <RoleForm
      key={`${roleId ?? 'new'}-${source.data?.id ?? ''}`}
      role={roleId ? source.data : undefined}
      duplicateFrom={roleId ? undefined : source.data}
    />
  );
}

function RoleForm({
  role,
  duplicateFrom,
}: {
  role?: RoleDetail;
  duplicateFrom?: RoleDetail;
}): ReactElement {
  const router = useRouter();
  const { can } = usePermissions();
  const canWrite = can(Permission.ROLE_WRITE);
  const base = role ?? duplicateFrom;
  const isNew = !role;
  const editable = isNew ? canWrite : role.editable && canWrite;
  const locked = role?.isOwner ?? false;
  const grantable = new Set(base?.grantable ?? []);

  const [name, setName] = useState(
    role ? role.name : duplicateFrom ? `${formatRoleLabel(duplicateFrom.name)} copy` : '',
  );
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(base?.permissions ?? []));

  const create = useCreateRole();
  const update = useUpdateRole();
  const reset = useResetRole();
  const remove = useDeleteRole();
  const roles = useRoles(Boolean(role));
  const [reassignTo, setReassignTo] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const permissionsChanged =
    role !== undefined &&
    (selected.size !== role.permissions.length || role.permissions.some((p) => !selected.has(p)));
  const added = [...selected].filter((p) => !role?.permissions.includes(p as never)).length;
  const removed = role ? role.permissions.filter((p) => !selected.has(p)).length : 0;

  function toggle(key: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save(): void {
    const permissions = [...selected] as RoleDetail['permissions'];
    if (isNew) {
      create.mutate(
        {
          name,
          description: description || undefined,
          permissions,
          duplicateFromRoleId: duplicateFrom?.id,
        },
        { onSuccess: (created) => router.push(`${LIST_PATH}/${created.id}`) },
      );
      return;
    }
    update.mutate(
      {
        id: role.id,
        input: {
          ...(role.isSystem ? {} : { name }),
          description: description || null,
          permissions,
        },
      },
      { onSuccess: () => router.push(LIST_PATH) },
    );
  }

  const otherRoles = (roles.data?.items ?? []).filter((r) => r.id !== role?.id);
  const busy = create.isPending || update.isPending || reset.isPending || remove.isPending;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          {locked && <Lock className="size-4" aria-label="Locked" />}
          {isNew ? 'New role' : formatRoleLabel(role.name)}
        </h2>
        {locked && (
          <p className="mt-1 text-sm text-muted-foreground">
            The Account Owner role is locked. It always has every permission, including new ones,
            and can&apos;t be edited, renamed or deleted.
          </p>
        )}
        {!locked && !isNew && !editable && (
          <p className="mt-1 text-sm text-muted-foreground">
            {role.id && canWrite
              ? 'You can’t edit your own role.'
              : 'You can view this role but not change it.'}
          </p>
        )}
      </div>

      {!locked && (
        <div className="grid max-w-xl gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={isNew || !role.isSystem ? name : formatRoleLabel(name)}
              onChange={(e) => setName(e.target.value)}
              disabled={!editable || (!isNew && role.isSystem)}
              maxLength={100}
            />
            {!isNew && role.isSystem && (
              <p className="text-xs text-muted-foreground">Default roles can&apos;t be renamed.</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="role-description">Description</Label>
            <Textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!editable}
              maxLength={255}
            />
          </div>
        </div>
      )}

      {!locked && (
        <div className="flex flex-col gap-5">
          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.label} className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-foreground">{group.label}</legend>
              {group.items.map(({ permission, label }) => {
                const allowed = editable && grantable.has(permission);
                return (
                  <label
                    key={permission}
                    className="flex items-center gap-2 text-sm text-foreground has-[:disabled]:text-muted-foreground"
                    title={
                      editable && !allowed
                        ? 'You can only grant permissions you hold yourself.'
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(permission)}
                      disabled={!allowed}
                      onChange={() => toggle(permission)}
                    />
                    {label}
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
      )}

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={busy || name.trim().length === 0}>
            {isNew ? 'Create role' : 'Save changes'}
          </Button>
          {permissionsChanged && role.userCount > 0 && (
            <span className="text-sm text-muted-foreground">
              Affects {role.userCount} {role.userCount === 1 ? 'user' : 'users'} (+{added} / −
              {removed} permissions)
            </span>
          )}
          <Button variant="outline" onClick={() => router.push(LIST_PATH)} disabled={busy}>
            Cancel
          </Button>
          {!isNew && (
            <Button
              variant="outline"
              onClick={() => router.push(`${LIST_PATH}/new?from=${role.id}`)}
              disabled={busy}
            >
              Duplicate
            </Button>
          )}
          {!isNew && role.isSystem && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => reset.mutate(role.id, { onSuccess: () => router.push(LIST_PATH) })}
            >
              Reset to default
            </Button>
          )}
          {!isNew && !role.isSystem && (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => setConfirmingDelete((value) => !value)}
            >
              Delete
            </Button>
          )}
        </div>
      )}

      {confirmingDelete && role && (
        <div className="flex max-w-xl flex-col gap-3 rounded-lg border border-border p-4">
          {role.userCount > 0 ? (
            <>
              <p className="text-sm text-foreground">
                {role.userCount} {role.userCount === 1 ? 'user has' : 'users have'} this role.
                Reassign them to delete it.
              </p>
              <NativeSelect value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <NativeSelectOption value="">Choose a role…</NativeSelectOption>
                {otherRoles.map((r) => (
                  <NativeSelectOption key={r.id} value={r.id}>
                    {formatRoleLabel(r.name)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </>
          ) : (
            <p className="text-sm text-foreground">Delete this role? This can&apos;t be undone.</p>
          )}
          <Button
            variant="destructive"
            disabled={busy || (role.userCount > 0 && !reassignTo)}
            onClick={() =>
              remove.mutate(
                { id: role.id, reassignToRoleId: reassignTo || undefined },
                { onSuccess: () => router.push(LIST_PATH) },
              )
            }
          >
            Confirm delete
          </Button>
        </div>
      )}
    </section>
  );
}
