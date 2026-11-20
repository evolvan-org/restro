import { type CustomDecorator, SetMetadata } from '@nestjs/common';

export const ALLOW_DURING_SETUP_KEY = 'allowDuringSetup';

/**
 * Marks routes an account may call before it is fully set up: while its restaurant's guided setup
 * is pending (owner only), or while it still has a one-time password. `JwtAuthGuard` answers every
 * other route with 403 `ONBOARDING_REQUIRED` / `PASSWORD_CHANGE_REQUIRED` in those states.
 */
export const AllowDuringSetup = (): CustomDecorator<string> =>
  SetMetadata(ALLOW_DURING_SETUP_KEY, true);
