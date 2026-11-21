import { Permission } from '@rms/permissions';

import { actorCan } from './actor-permissions';
import type { Actor } from './authenticated-request';
import { effectivePermissions, roleCan } from './role-access';

const owner = { name: 'OWNER', isOwner: true, permissions: [] };
const captain = {
  name: 'CAPTAIN',
  isOwner: false,
  permissions: [{ permissionKey: 'floor:read' }, { permissionKey: 'table:be-captain' }],
};

describe('role access', () => {
  it('lets the Owner pass any permission through the flag', () => {
    expect(roleCan(owner, Permission.SETTINGS_READ)).toBe(true);
    expect(roleCan(owner, Permission.ROLE_WRITE)).toBe(true);
  });

  it('resolves eligibility markers from real rows, never the Owner bypass', () => {
    expect(roleCan(owner, Permission.TABLE_BE_CAPTAIN)).toBe(false);
    expect(roleCan(captain, Permission.TABLE_BE_CAPTAIN)).toBe(true);
    expect(effectivePermissions(owner)).not.toContain(Permission.TABLE_BE_CAPTAIN);
  });

  it('grants a non-owner only the keys on its rows', () => {
    expect(roleCan(captain, Permission.FLOOR_READ)).toBe(true);
    expect(roleCan(captain, Permission.SETTINGS_READ)).toBe(false);
    expect(effectivePermissions(captain)).toEqual([
      Permission.FLOOR_READ,
      Permission.TABLE_BE_CAPTAIN,
    ]);
  });

  it('ignores stored keys that are not in the catalog', () => {
    const stale = {
      name: 'X',
      isOwner: false,
      permissions: [{ permissionKey: 'restaurant:read' }],
    };
    expect(effectivePermissions(stale)).toEqual([]);
  });

  it('applies the same rules to an actor', () => {
    const actor = { isOwner: true, permissions: [] } as unknown as Actor;
    expect(actorCan(actor, Permission.USER_DELETE)).toBe(true);
    expect(actorCan(actor, Permission.TABLE_BE_CAPTAIN)).toBe(false);
  });
});
