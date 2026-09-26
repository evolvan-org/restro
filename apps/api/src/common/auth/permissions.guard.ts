import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isRole, type Permission, roleHasAll } from '@rms/permissions';

import { ActorRepository } from './actor.repository';
import type { AuthorizedRequest } from './authenticated-request';
import { REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator';

/**
 * Authorizes the caller against `@RequirePermissions(...)` using the `@rms/permissions` policy.
 * Must run after `JwtAuthGuard`: `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
 *
 * Loads the caller's current role and status on every request, so a deactivated account or a
 * role change takes effect immediately, and attaches the result as `request.actor`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly actorRepository: ActorRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<Permission[] | undefined>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();

    const userId = request.auth?.userId;
    if (!userId) {
      throw new UnauthorizedException('Authentication is required');
    }

    const user = await this.actorRepository.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    const role = user.role.name;
    if (!isRole(role) || !roleHasAll(role, required)) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    request.actor = { userId, restaurantId: user.restaurantId, role };
    return true;
  }
}
