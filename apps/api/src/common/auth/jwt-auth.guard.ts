import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { AuthenticatedRequest } from './authenticated-request';

const jwtClaimsSchema = z.object({
  userId: z.string().uuid(),
});

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication is required');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Authentication is required');
    }

    try {
      const decoded = jwt.verify(token, this.config.getOrThrow<string>('JWT_SECRET'));
      const claims = jwtClaimsSchema.parse(decoded);
      request.auth = { userId: claims.userId };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
