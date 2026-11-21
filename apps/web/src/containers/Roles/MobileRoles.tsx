import { ChevronDown, ChevronLeft, ChevronRight, Lock, Plus, Search } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { MATRIX_KEYS, PERMISSION_GROUPS } from '@/lib/permission-labels';
import { formatRoleLabel } from '@/lib/utils';

import PermissionCell from './PermissionCell';
import { lockFor, lockMessage } from './PermissionMatrix';
import { matrixCount, type RoleDraft, type RoleItem } from './roles-model';

type View = { kind: 'list' } | { kind: 'editor'; roleId: string } | { kind: 'compare' };

type Props = {
  roles: readonly RoleItem[];
  draft: RoleDraft;
  grantable: ReadonlySet<string>;
  canWrite: boolean;
  actorRoleId: string;
  actorRoleName: string;
  onNewRole: () => void;
};

/** Phone layout: roles list → one role at a time → side-by-side comparison. */
export default function MobileRoles(props: Props): ReactElement {
  const { roles, draft, canWrite, onNewRole } = props;
  const [view, setView] = useState<View>({ kind: 'list' });
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [compareIds, setCompareIds] = useState<[string, string]>([
    roles.find((r) => !r.isOwner)?.id ?? '',
    roles.filter((r) => !r.isOwner)[1]?.id ?? '',
  ]);
  const [diffOnly, setDiffOnly] = useState(true);
  const editableRoles = roles.filter((r) => !r.isOwner);

  if (view.kind === 'list') {
    const term = search.trim().toLowerCase();
    const shown = roles.filter((r) => formatRoleLabel(r.name).toLowerCase().includes(term));
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Roles</h2>
          {canWrite && (
            <Button size="sm" onClick={onNewRole}>
              <Plus className="size-4" /> New
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              className="pl-9"
              placeholder="Search roles"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => setView({ kind: 'compare' })}>
            Compare
          </Button>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {shown.map((role) => (
            <li key={role.id}>
              <button
                type="button"
                disabled={role.isOwner}
                onClick={() => setView({ kind: 'editor', roleId: role.id })}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2">
                  {role.isOwner && <Lock className="size-4" aria-hidden />}
                  <span>
                    <span className="flex items-center gap-2 font-medium">
                      {formatRoleLabel(role.name)}
                      {!role.isOwner && (
                        <Badge variant="secondary">{role.isSystem ? 'System' : 'Custom'}</Badge>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {role.userCount === 0
                        ? 'No users yet'
                        : `${role.userCount} ${role.userCount === 1 ? 'user' : 'users'}`}
                      {role.isOwner && ' · Full access'}
                    </span>
                  </span>
                </span>
                {role.isOwner ? (
                  <Badge variant="secondary">Locked</Badge>
                ) : (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    {matrixCount(draft.effective(role.id))}/{MATRIX_KEYS.length}
                    <ChevronRight className="size-4" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (view.kind === 'compare') {
    const [aId, bId] = compareIds;
    const a = editableRoles.find((r) => r.id === aId);
    const b = editableRoles.find((r) => r.id === bId);
    const rows = PERMISSION_GROUPS.flatMap((g) =>
      g.items.map((item) => ({ group: g.label, item })),
    ).filter(
      ({ item }) =>
        !diffOnly ||
        (a &&
          b &&
          draft.effective(a.id).has(item.permission) !==
            draft.effective(b.id).has(item.permission)),
    );
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setView({ kind: 'list' })}
          className="flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" /> Roles
        </button>
        <h2 className="text-lg font-semibold">Compare roles</h2>
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((slot) => (
            <NativeSelect
              key={slot}
              aria-label={`Role ${slot + 1}`}
              value={compareIds[slot]}
              onChange={(e) => {
                const next: [string, string] = [...compareIds];
                next[slot] = e.target.value;
                setCompareIds(next);
              }}
            >
              {editableRoles.map((r) => (
                <NativeSelectOption key={r.id} value={r.id}>
                  {formatRoleLabel(r.name)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ))}
        </div>
        <label className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={diffOnly}
              onChange={(e) => setDiffOnly(e.target.checked)}
            />
            Differences only
          </span>
          <span className="text-muted-foreground">
            {rows.length} {diffOnly ? (rows.length === 1 ? 'difference' : 'differences') : 'rows'}
          </span>
        </label>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
            No differences between these roles.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {rows.map(({ group, item }) => (
              <div key={item.permission} className="flex items-center gap-2 px-3 py-2.5">
                <span className="flex-1 text-sm">
                  <span className="block text-xs text-muted-foreground">{group}</span>
                  {item.label}
                </span>
                {[a, b].map((role, i) =>
                  role ? (
                    <span key={role.id} className="w-14 text-center">
                      <PermissionCell
                        checked={draft.effective(role.id).has(item.permission)}
                        changed={
                          draft.effective(role.id).has(item.permission) !==
                          role.permissions.includes(item.permission as never)
                        }
                        lock={lockFor(role, item.permission, props)}
                        lockMessage={lockMessage(
                          lockFor(role, item.permission, props),
                          item.label,
                          props.actorRoleName,
                        )}
                        label={`${item.label} for ${formatRoleLabel(role.name)}`}
                        onToggle={() => draft.toggle(role.id, item.permission)}
                      />
                    </span>
                  ) : (
                    <span key={i} className="w-14" />
                  ),
                )}
              </div>
            ))}
          </div>
        )}
        {canWrite && (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Tap a box to change it. Saving uses the same “Save for N staff” confirm as desktop.
          </p>
        )}
      </div>
    );
  }

  const role = roles.find((r) => r.id === view.roleId) ?? editableRoles[0];
  if (!role) return <p className="text-sm text-muted-foreground">No roles.</p>;
  const keys = draft.effective(role.id);
  const term = search.trim().toLowerCase();
  const granted = matrixCount(keys);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setView({ kind: 'list' })}
          className="flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" /> Roles
        </button>
        <NativeSelect
          aria-label="Role"
          className="flex-1"
          value={role.id}
          onChange={(e) => setView({ kind: 'editor', roleId: e.target.value })}
        >
          {editableRoles.map((r) => (
            <NativeSelectOption key={r.id} value={r.id}>
              {formatRoleLabel(r.name)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Badge variant="secondary">{role.isSystem ? 'System' : 'Custom'}</Badge>
          {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
        </span>
        <span>
          <strong>{granted}</strong> of {MATRIX_KEYS.length}
        </span>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input
          className="pl-9"
          placeholder="Search permissions"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="rounded-lg border border-border">
        {PERMISSION_GROUPS.map((group) => {
          const items = group.items.filter((i) => !term || i.label.toLowerCase().includes(term));
          if (items.length === 0) return null;
          const expanded = Boolean(term) || open.has(group.label);
          const saved = new Set(role.permissions);
          const dirty = group.items.some((i) => keys.has(i.permission) !== saved.has(i.permission));
          return (
            <div key={group.label} className="border-b border-border last:border-0">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() =>
                  setOpen((current) => {
                    const next = new Set(current);
                    if (!next.delete(group.label)) next.add(group.label);
                    return next;
                  })
                }
                className="flex w-full items-center justify-between bg-muted/30 px-4 py-3 text-left font-semibold"
              >
                <span className="flex items-center gap-2">
                  {expanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  {group.label}
                </span>
                <span className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
                  {dirty && (
                    <span
                      className="size-1.5 rounded-full bg-orange-500"
                      aria-label="Unsaved changes"
                    />
                  )}
                  {matrixCount(
                    keys,
                    group.items.map((i) => i.permission),
                  )}{' '}
                  of {group.items.length}
                </span>
              </button>
              {expanded &&
                items.map((item) => {
                  const lock = lockFor(role, item.permission, props);
                  const checked = keys.has(item.permission);
                  const changed = checked !== saved.has(item.permission);
                  return (
                    <div
                      key={item.permission}
                      className={`flex items-center justify-between gap-3 border-t border-border px-4 py-3 ${changed ? 'bg-orange-50' : ''}`}
                    >
                      <span className="text-sm">
                        {item.label}
                        {changed && (
                          <span className="ml-2 text-xs font-medium text-orange-600">Changed</span>
                        )}
                        {lock === 'not-held' && (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="size-3" aria-hidden /> Not in your role
                          </span>
                        )}
                      </span>
                      <PermissionCell
                        checked={checked}
                        changed={changed}
                        lock={lock}
                        lockMessage={lockMessage(lock, item.label, props.actorRoleName)}
                        label={item.label}
                        onToggle={() => draft.toggle(role.id, item.permission)}
                      />
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
