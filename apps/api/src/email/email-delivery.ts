import type { Logger } from '@nestjs/common';

import { errorDiagnostics } from '../common/logging/error-diagnostics';
import { EmailDeliveryError } from './email.types';

/**
 * Runs a send whose failure must not undo work that is already committed (e.g. a new account).
 * Returns false and logs when the provider rejects or is unreachable; any other error propagates.
 */
export async function deliverBestEffort(
  logger: Logger,
  context: { flow: string; userId: string },
  send: () => Promise<void>,
): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (error) {
    if (!(error instanceof EmailDeliveryError)) throw error;
    logger.error('Transactional email not delivered', { ...context, ...errorDiagnostics(error) });
    return false;
  }
}
