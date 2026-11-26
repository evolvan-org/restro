import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { API_ERROR_CODES } from '@rms/api-contract';
import { Permission } from '@rms/permissions';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { errorDiagnostics } from '../logging/error-diagnostics';
import { type ActorRecord, ActorRepository, LAST_SEEN_THROTTLE_MS } from './actor.repository';
import { ALLOW_DURING_SETUP_KEY } from './allow-during-setup.decorator';
import type { AuthenticatedRequest } from './authenticated-request';
import { effectivePermissions, roleCan } from './role-access';

const jwtClaimsSchema = z.object({
  userId: z.string().uuid(),
  authVersion: z.number().int().nonnegative().default(0),
});

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly actors: ActorRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw authenticationRequired();

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) throw authenticationRequired();

    const claims = this.verifyClaims(token);
    // Outside the token try/catch on purpose: a database failure must surface as a 5xx through the
    // global filter, not as a 401 that makes the web client log every user out.
    const user = await this.actors.findById(claims.userId);
    if (!user || user.status !== 'ACTIVE' || user.authVersion !== claims.authVersion) {
      throw invalidToken();
    }
    this.assertSetUp(context, user);
    this.recordPresence(claims.userId, user.lastSeenAt);

    request.auth = { userId: claims.userId, authVersion: claims.authVersion };
    request.actor = {
      userId: claims.userId,
      restaurantId: user.restaurantId,
      roleId: user.roleId,
      role: user.role.name,
      isOwner: user.role.isOwner,
      permissions: effectivePermissions(user.role),
      emailVerifiedAt: user.emailVerifiedAt,
    };
    return true;
  }

  /**
   * Until the restaurant's setup is finished only its owner may hold a working token, and only for
   * setup routes: anything created elsewhere could collide with what finishing setup writes. An
   * account still on its one-time password may only change it.
   */
  private assertSetUp(context: ExecutionContext, user: ActorRecord): void {
    const setupPending = user.restaurant.onboardingCompletedAt === null;
    if (setupPending && !roleCan(user.role, Permission.ONBOARDING_MANAGE)) {
      throw invalidToken();
    }
    if (!setupPending && !user.mustChangePassword) return;

    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_DURING_SETUP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return;

    throw setupPending
      ? new ForbiddenException({
          message: 'Finish setting up your restaurant first.',
          error: 'Forbidden',
          code: API_ERROR_CODES.ONBOARDING_REQUIRED,
        })
      : new ForbiddenException({
          message: 'Change your one-time password to continue.',
          error: 'Forbidden',
          code: API_ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
        });
  }

  /**
   * Captain availability for QR ordering is "seen recently": refreshed in the background, at most
   * once a minute, and never allowed to fail or slow down the request.
   */
  private recordPresence(userId: string, lastSeenAt: Date | null): void {
    const now = new Date();
    if (lastSeenAt && now.getTime() - lastSeenAt.getTime() < LAST_SEEN_THROTTLE_MS) return;
    this.actors.touchLastSeen(userId, now).catch((error: unknown) => {
      this.logger.warn('Unable to record staff presence', errorDiagnostics(error));
    });
  }

  private verifyClaims(token: string): z.infer<typeof jwtClaimsSchema> {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    try {
      return jwtClaimsSchema.parse(jwt.verify(token, secret, { algorithms: ['HS256'] }));
    } catch (error) {
      // Covers TokenExpiredError and NotBeforeError, which extend JsonWebTokenError.
      if (error instanceof jwt.JsonWebTokenError || error instanceof z.ZodError) {
        throw invalidToken();
      }
      throw error;
    }
  }
}

function authenticationRequired(): UnauthorizedException {
  return new UnauthorizedException('Authentication is required');
}

function invalidToken(): UnauthorizedException {
  return new UnauthorizedException('Invalid or expired access token');
}
