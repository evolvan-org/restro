import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthorizedRequest } from './authenticated-request';

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    if (!request.actor?.emailVerifiedAt) {
      throw new ForbiddenException('Verify your email before managing staff invitations');
    }
    return true;
  }
}
