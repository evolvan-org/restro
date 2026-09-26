import type { Role } from '@rms/permissions';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & {
  auth: {
    userId: string;
  };
};

/** The caller as loaded by `PermissionsGuard`: active, with a known system role. */
export type Actor = {
  userId: string;
  restaurantId: string;
  role: Role;
};

export type AuthorizedRequest = AuthenticatedRequest & {
  actor: Actor;
};
