import { type ReactElement, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { getApiErrorMessage } from '@/lib/api-error';
import { permissionGroupLabel, permissionLabel } from '@/lib/permission-labels';
import { formatRoleLabel } from '@/lib/utils';
import { useCreateRole, useDeleteRole } from '@/services/api/requests/roles';

import { matrixCount, type RoleChange, type RoleItem } from './roles-model';

export function ReviewChangesModal({
  changes,
  affectedUsers,
  saving,
  onBack,
  onSave,
}: {
  changes: readonly RoleChange[];
  affectedUsers: number;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
}): ReactElement {
  const total = changes.reduce((sum, c) => sum + c.added.length + c.removed.length, 0);
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onBack()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Save {total} {total === 1 ? 'change' : 'changes'} in {changes.length}{' '}
            {changes.length === 1 ? 'role' : 'roles'}?
          </DialogTitle>
          <DialogDescription>
            {affectedUsers} staff {affectedUsers === 1 ? 'is' : 'are'} affected. Changes apply
            straight away, including on devices already signed in.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-auto rounded-lg border border-border text-sm">
          {changes.map(({ role, added, removed }) => (
            <div key={role.id}>
              <div className="flex justify-between bg-muted/50 px-3 py-2 text-xs font-semibold">
                <span>{formatRoleLabel(role.name)}</span>
                <span className="font-normal text-muted-foreground">
                  {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
                </span>
              </div>
              {[
                ...added.map((key) => ({ key, kind: 'added' as const })),
                ...removed.map((key) => ({ key, kind: 'removed' as const })),
              ].map(({ key, kind }) => (
                <div
                  key={`${kind}-${key}`}
                  className="flex items-center gap-3 border-t border-border px-3 py-2"
                >
                  <span
                    className={
                      kind === 'added'
                        ? 'rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800'
                        : 'rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800'
                    }
                  >
                    {kind === 'added' ? '+ Added' : '− Removed'}
                  </span>
                  <span className="flex-1 text-foreground">{permissionLabel(key)}</span>
                  <span className="text-xs text-muted-foreground">{permissionGroupLabel(key)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onBack} disabled={saving}>
            Back to matrix
          </Button>
          <Button onClick={onSave} disabled={saving}>
            Save for {affectedUsers} staff
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewRoleModal({
  roles,
  grantable,
  initialSourceId,
  onClose,
  onCreated,
}: {
  roles: readonly RoleItem[];
  grantable: ReadonlySet<string>;
  initialSourceId?: string;
  onClose: () => void;
  onCreated: (role: { id: string; name: string }) => void;
}): ReactElement {
  const create = useCreateRole();
  const [name, setName] = useState('');
  const [sourceId, setSourceId] = useState(initialSourceId ?? '');
  const [error, setError] = useState<string | null>(null);
  const sources = roles.filter((role) => !role.isOwner);

  function submit(): void {
    if (!name.trim()) {
      setError('Enter a role name');
      return;
    }
    const source = sources.find((role) => role.id === sourceId);
    create.mutate(
      {
        name: name.trim(),
        // Only what the caller may grant is copied; the API rejects anything else.
        permissions: source?.permissions.filter((key) => grantable.has(key)) ?? [],
        duplicateFromRoleId: source?.id,
      },
      {
        onSuccess: (role) => onCreated(role),
        onError: (e) => setError(getApiErrorMessage(e, 'Unable to create the role.')),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>
            Adds a column on the right. Staff are assigned on the Team page.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="new-role-name">Role name</Label>
            <Input
              id="new-role-name"
              value={name}
              maxLength={100}
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-role-source">Start from</Label>
            <NativeSelect
              id="new-role-source"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <NativeSelectOption value="">Blank role (no permissions)</NativeSelectOption>
              {sources.map((role) => (
                <NativeSelectOption key={role.id} value={role.id}>
                  Copy of {formatRoleLabel(role.name)} ({matrixCount(new Set(role.permissions))}{' '}
                  permissions)
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Account Owner can&apos;t be copied. Permissions your role doesn&apos;t include are
              left off.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            Add role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRoleModal({
  role,
  roles,
  onClose,
  onDeleted,
}: {
  role: RoleItem;
  roles: readonly RoleItem[];
  onClose: () => void;
  onDeleted: () => void;
}): ReactElement {
  const remove = useDeleteRole();
  const targets = roles.filter((r) => r.id !== role.id && !r.isOwner);
  const [reassignTo, setReassignTo] = useState(targets[0]?.id ?? '');
  const hasUsers = role.userCount > 0;
  const label = formatRoleLabel(role.name);

  return (
    <Dialog open onOpenChange={(open) => !open && !remove.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {hasUsers ? `Can't delete “${label}” yet` : `Delete “${label}”?`}
          </DialogTitle>
          <DialogDescription>
            {hasUsers
              ? `${role.userCount} staff ${role.userCount === 1 ? 'member has' : 'members have'} this role. Move them to another role, then delete.`
              : "No staff have this role. This can't be undone."}
          </DialogDescription>
        </DialogHeader>
        {hasUsers && (
          <div className="grid gap-1.5">
            <Label htmlFor="reassign-role">Move staff to</Label>
            <NativeSelect
              id="reassign-role"
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
            >
              {targets.map((r) => (
                <NativeSelectOption key={r.id} value={r.id}>
                  {formatRoleLabel(r.name)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending || (hasUsers && !reassignTo)}
            onClick={() =>
              remove.mutate(
                { id: role.id, reassignToRoleId: hasUsers ? reassignTo : undefined },
                { onSuccess: onDeleted },
              )
            }
          >
            {hasUsers ? 'Move staff & delete' : 'Delete role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
