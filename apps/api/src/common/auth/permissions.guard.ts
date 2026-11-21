import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@rms/permissions';

import { actorCanAll } from './actor-permissions';
import type { AuthorizedRequest } from './authenticated-request';
import { REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator';

/**
 * Authorizes the caller against `@RequirePermissions(...)` using the permissions resolved from
 * `role_permissions` (or the Owner bypass).
 * Must run after `JwtAuthGuard`: `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
 *
 * The actor is loaded on every request by `JwtAuthGuard`, so a deactivated account or a role
 * change takes effect on the next request.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<Permission[] | undefined>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();

    const actor = request.actor;
    if (!actor) {
      throw new UnauthorizedException('Authentication is required');
    }

    if (!actorCanAll(actor, required)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }
}
