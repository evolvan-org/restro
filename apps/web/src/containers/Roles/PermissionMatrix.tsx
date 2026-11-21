import { ChevronDown, ChevronRight, Lock, Plus } from 'lucide-react';
import { Fragment, type ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { PERMISSION_GROUPS } from '@/lib/permission-labels';
import { formatRoleLabel } from '@/lib/utils';

import PermissionCell from './PermissionCell';
import { type CellLock, matrixCount, type RoleDraft, type RoleItem } from './roles-model';

type Props = {
  roles: readonly RoleItem[];
  draft: RoleDraft;
  grantable: ReadonlySet<string>;
  canWrite: boolean;
  actorRoleId: string;
  actorRoleName: string;
  search: string;
  diffOnly: boolean;
  expanded: ReadonlySet<string>;
  onToggleGroup: (label: string) => void;
  onOpenRole: (roleId: string) => void;
  onNewRole: () => void;
};

export function lockFor(
  role: RoleItem,
  key: string,
  ctx: Pick<Props, 'canWrite' | 'actorRoleId' | 'grantable'>,
): CellLock {
  if (!ctx.canWrite) return 'readonly';
  if (role.id === ctx.actorRoleId) return 'own-role';
  return ctx.grantable.has(key) ? null : 'not-held';
}

export function lockMessage(lock: CellLock, label: string, actorRoleName: string): string {
  if (lock === 'own-role') return "You can't edit your own role.";
  return `You can't grant ${label} because your role (${formatRoleLabel(actorRoleName)}) doesn't include it. Ask an Account Owner.`;
}

/** Rows that match the search and, optionally, differ between the editable roles. */
export function visibleGroups(
  roles: readonly RoleItem[],
  draft: RoleDraft,
  search: string,
  diffOnly: boolean,
) {
  const term = search.trim().toLowerCase();
  const editable = roles.filter((role) => !role.isOwner);
  return PERMISSION_GROUPS.map((group) => ({
    ...group,
    shown: group.items.filter((item) => {
      if (term && !item.label.toLowerCase().includes(term)) return false;
      if (!diffOnly) return true;
      const values = editable.map((role) => draft.effective(role.id).has(item.permission));
      return values.some((v) => v !== values[0]);
    }),
  })).filter((group) => group.shown.length > 0);
}

export default function PermissionMatrix(props: Props): ReactElement {
  const { roles, draft, search, diffOnly, expanded, onToggleGroup, onOpenRole, onNewRole } = props;
  const owner = roles.find((role) => role.isOwner);
  const others = roles.filter((role) => !role.isOwner);
  const groups = visibleGroups(roles, draft, search, diffOnly);

  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        {search.trim()
          ? `No permissions match “${search.trim()}”.`
          : 'No differences between these roles.'}
      </p>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className="sticky top-0 z-20 bg-background">
          <tr className="border-b border-border">
            <th className="w-72 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Permission
            </th>
            {owner && (
              <th className="w-24 bg-muted/60 px-2 py-3 text-center">
                <button
                  type="button"
                  onClick={() => onOpenRole(owner.id)}
                  className="flex w-full flex-col items-center gap-0.5"
                >
                  <Lock className="size-3" aria-hidden />
                  <span className="font-semibold text-foreground">Owner</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {owner.userCount} {owner.userCount === 1 ? 'user' : 'users'}
                  </span>
                </button>
              </th>
            )}
            {others.map((role) => (
              <th key={role.id} className="px-2 py-3 text-center">
                <button
                  type="button"
                  onClick={() => onOpenRole(role.id)}
                  className="flex w-full flex-col items-center gap-0.5"
                >
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    {formatRoleLabel(role.name)}
                    {draft.changedRoleIds.has(role.id) && (
                      <span
                        className="size-1.5 rounded-full bg-orange-500"
                        aria-label="Unsaved changes"
                      />
                    )}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {role.userCount === 0
                      ? 'No users yet'
                      : `${role.userCount} ${role.userCount === 1 ? 'user' : 'users'}`}
                  </span>
                  <Badge variant="secondary">{role.isSystem ? 'System' : 'Custom'}</Badge>
                </button>
              </th>
            ))}
            <th className="w-12 px-2 py-3 text-center">
              {props.canWrite && (
                <button
                  type="button"
                  aria-label="New role"
                  onClick={onNewRole}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus className="size-4" />
                </button>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const open = Boolean(search.trim()) || expanded.has(group.label);
            return (
              <Fragment key={group.label}>
                <tr className="border-b border-border bg-muted/30">
                  <th scope="row" className="px-4 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => onToggleGroup(group.label)}
                      aria-expanded={open}
                      className="flex items-center gap-1.5 font-semibold text-foreground"
                    >
                      {open ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                      {group.label}
                    </button>
                  </th>
                  {owner && <td className="bg-muted/60 text-center text-xs font-medium">All</td>}
                  {others.map((role) => {
                    const keys = draft.effective(role.id);
                    const saved = new Set(role.permissions);
                    const dirty = group.items.some(
                      (i) => keys.has(i.permission) !== saved.has(i.permission),
                    );
                    return (
                      <td key={role.id} className="text-center text-xs font-medium">
                        {matrixCount(
                          keys,
                          group.items.map((i) => i.permission),
                        )}
                        /{group.items.length}
                        {dirty && (
                          <span
                            className="ml-1 inline-block size-1.5 rounded-full bg-orange-500"
                            aria-label="Unsaved changes"
                          />
                        )}
                      </td>
                    );
                  })}
                  <td />
                </tr>
                {open &&
                  group.shown.map((item) => (
                    <tr key={item.permission} className="border-b border-border last:border-0">
                      <th
                        scope="row"
                        className="py-2 pl-9 pr-4 text-left font-normal text-foreground"
                      >
                        <span className="flex items-center justify-between gap-2">
                          {item.label}
                          {item.eligibility && <Badge variant="secondary">Eligibility</Badge>}
                        </span>
                      </th>
                      {owner && (
                        <td className="bg-muted/60 text-center">
                          <span className="sr-only">Granted</span>
                          <span aria-hidden>✓</span>
                        </td>
                      )}
                      {others.map((role) => {
                        const lock = lockFor(role, item.permission, props);
                        const checked = draft.effective(role.id).has(item.permission);
                        return (
                          <td key={role.id} className="py-2 text-center">
                            <PermissionCell
                              checked={checked}
                              changed={
                                checked !== role.permissions.includes(item.permission as never)
                              }
                              lock={lock}
                              lockMessage={lockMessage(lock, item.label, props.actorRoleName)}
                              label={`${item.label} for ${formatRoleLabel(role.name)}`}
                              onToggle={() => draft.toggle(role.id, item.permission)}
                            />
                          </td>
                        );
                      })}
                      <td />
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
