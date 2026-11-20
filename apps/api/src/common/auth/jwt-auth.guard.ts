import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isRole } from '@rms/permissions';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { ActorRepository } from './actor.repository';
import type { AuthenticatedRequest } from './authenticated-request';

const jwtClaimsSchema = z.object({
  userId: z.string().uuid(),
  authVersion: z.number().int().nonnegative().default(0),
});

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly actors: ActorRepository,
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
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.authVersion !== claims.authVersion ||
      !isRole(user.role.name)
    ) {
      throw invalidToken();
    }

    request.auth = { userId: claims.userId, authVersion: claims.authVersion };
    request.actor = {
      userId: claims.userId,
      restaurantId: user.restaurantId,
      role: user.role.name,
      emailVerifiedAt: user.emailVerifiedAt,
    };
    return true;
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
