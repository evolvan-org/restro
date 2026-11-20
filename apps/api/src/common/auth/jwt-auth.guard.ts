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

    try {
      const decoded = jwt.verify(token, this.config.getOrThrow<string>('JWT_SECRET'), {
        algorithms: ['HS256'],
      });
      const claims = jwtClaimsSchema.parse(decoded);
      const user = await this.actors.findById(claims.userId);
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        user.authVersion !== claims.authVersion ||
        !isRole(user.role.name)
      ) {
        throw new Error('Current account state does not authorize this token');
      }

      request.auth = { userId: claims.userId, authVersion: claims.authVersion };
      request.actor = {
        userId: claims.userId,
        restaurantId: user.restaurantId,
        role: user.role.name,
        emailVerifiedAt: user.emailVerifiedAt,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}

function authenticationRequired(): UnauthorizedException {
  return new UnauthorizedException('Authentication is required');
}
