import type { RoleListResponse } from '@rms/api-contract';
import { type Role as DefaultRoleName, ROLE_PERMISSIONS } from '@rms/permissions';
import { useState } from 'react';

import { MATRIX_KEYS, permissionGroupLabel } from '@/lib/permission-labels';

export type RoleItem = RoleListResponse['items'][number];

/** Why a cell can't be toggled; `null` means it can. */
export type CellLock = 'readonly' | 'own-role' | 'not-held' | null;

export type RoleChange = { role: RoleItem; added: string[]; removed: string[] };

export function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((key) => b.has(key));
}

/** How many of the matrix rows the set grants (hidden keys such as `user:delete` don't count). */
export function matrixCount(
  keys: ReadonlySet<string>,
  only: readonly string[] = MATRIX_KEYS,
): number {
  return only.filter((key) => keys.has(key)).length;
}

/** The seeded permissions of a default role, or `undefined` for custom roles and the Owner. */
export function defaultPermissionsOf(role: RoleItem): string[] | undefined {
  if (!role.isSystem || role.isOwner) return undefined;
  const defaults = (ROLE_PERMISSIONS as Record<string, readonly string[] | undefined>)[
    role.name as DefaultRoleName
  ];
  return defaults ? [...defaults] : undefined;
}

export function groupsOfChange(keys: string[]): string {
  return [...new Set(keys.map(permissionGroupLabel))].join(', ');
}

/**
 * Unsaved permission edits, kept per role. A role whose edited set equals the saved one drops out
 * of the draft, so "N changes" always means real differences.
 */
export function useRoleDraft(roles: readonly RoleItem[]) {
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const byId = new Map(roles.map((role) => [role.id, role]));

  const effective = (roleId: string): Set<string> =>
    new Set(draft[roleId] ?? byId.get(roleId)?.permissions ?? []);

  const stage = (roleId: string, keys: Iterable<string>): void => {
    const role = byId.get(roleId);
    if (!role) return;
    const next = new Set(keys);
    setDraft((current) => {
      const { [roleId]: _removed, ...rest } = current;
      return sameSet(next, new Set(role.permissions)) ? rest : { ...rest, [roleId]: [...next] };
    });
  };

  const toggle = (roleId: string, key: string): void => {
    const next = effective(roleId);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    stage(roleId, next);
  };

  const changes: RoleChange[] = roles.flatMap((role) => {
    const edited = draft[role.id];
    if (!edited) return [];
    const now = new Set(edited);
    const before = new Set<string>(role.permissions);
    return [
      {
        role,
        added: [...now].filter((key) => !before.has(key)),
        removed: [...before].filter((key) => !now.has(key)),
      },
    ];
  });

  return {
    effective,
    stage,
    toggle,
    discard: () => setDraft({}),
    changes,
    changedRoleIds: new Set(changes.map((change) => change.role.id)),
    totalChanges: changes.reduce((sum, c) => sum + c.added.length + c.removed.length, 0),
    affectedUsers: changes.reduce((sum, c) => sum + c.role.userCount, 0),
    draftFor: (roleId: string) => draft[roleId],
  };
}

export type RoleDraft = ReturnType<typeof useRoleDraft>;
