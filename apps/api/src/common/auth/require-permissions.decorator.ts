import { type CustomDecorator, SetMetadata } from '@nestjs/common';
import type { Permission } from '@rms/permissions';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Permissions the caller's role must hold (all of them), checked by `PermissionsGuard`.
 * A method-level decorator overrides a class-level one.
 */
export const RequirePermissions = (...permissions: Permission[]): CustomDecorator<string> =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
