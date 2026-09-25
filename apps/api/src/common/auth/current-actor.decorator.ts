import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Actor, AuthorizedRequest } from './authenticated-request';

/** The caller loaded by `PermissionsGuard`; only available on routes that use it. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    return request.actor;
  },
);
