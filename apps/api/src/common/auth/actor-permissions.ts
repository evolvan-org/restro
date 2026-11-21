import { ELIGIBILITY_ONLY_PERMISSIONS, type Permission } from '@rms/permissions';

import type { Actor } from './authenticated-request';

/** See `roleCan`: the Owner flag bypasses everything except eligibility markers. */
export function actorCan(actor: Actor, permission: Permission): boolean {
  if (ELIGIBILITY_ONLY_PERMISSIONS.includes(permission))
    return actor.permissions.includes(permission);
  return actor.isOwner || actor.permissions.includes(permission);
}

export function actorCanAll(actor: Actor, required: readonly Permission[]): boolean {
  return required.every((p) => actorCan(actor, p));
}
