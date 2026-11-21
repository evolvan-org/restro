import type { Permission } from '@rms/permissions';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & {
  auth: {
    userId: string;
    authVersion: number;
  };
  actor?: Actor;
};

/** The caller as loaded by `JwtAuthGuard`: active, with the role's access resolved from the database. */
export type Actor = {
  userId: string;
  restaurantId: string;
  role: string;
  isOwner: boolean;
  /** Granted keys from `role_permissions`; Owners hold none and bypass via `isOwner`. */
  permissions: readonly Permission[];
  emailVerifiedAt: Date | null;
};

export type AuthorizedRequest = AuthenticatedRequest & {
  actor: Actor;
};
