import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { errorDiagnostics } from '../common/logging/error-diagnostics';
import { QrNotifier } from './qr-notifier.service';
import { QrStaffRepository } from './qr-staff.repository';
import { firstName } from './qr-status';

/** How often due rounds are swept. Deadlines are stored, so a restart loses nothing. */
export const ESCALATION_SWEEP_MS = 15_000;

/**
 * Escalation engine. On submit a round stores `escalate_at` (now + timeout, or now when the captain
 * is unavailable). This sweep claims due rounds with one `UPDATE … RETURNING` — so across several
 * API instances each round escalates exactly once — opens an escalation alert and notifies
 * managers. "I'm on my way" (`on_my_way_at`), approve, reject and reassign take a round out of the
 * sweep; reassigning restarts its deadline for the new captain.
 */
@Injectable()
export class QrEscalationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(QrEscalationService.name);
  private timer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(
    private readonly repository: QrStaffRepository,
    private readonly notifier: QrNotifier,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep(), ESCALATION_SWEEP_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Escalates every due round (optionally for one restaurant, e.g. right after a submit). */
  async sweep(restaurantId?: string): Promise<number> {
    if (this.sweeping && !restaurantId) return 0;
    if (!restaurantId) this.sweeping = true;
    try {
      const now = new Date();
      const rounds = await this.repository.escalateDueRounds(now, restaurantId);
      for (const round of rounds) {
        await this.notify(round, now);
      }
      return rounds.length;
    } catch (error) {
      this.logger.error('QR escalation sweep failed', errorDiagnostics(error));
      return 0;
    } finally {
      if (!restaurantId) this.sweeping = false;
    }
  }

  private async notify(
    round: { id: string; restaurantId: string; sessionId: string },
    now: Date,
  ): Promise<void> {
    const summary = await this.repository.findEscalatedRoundSummary(round.id);
    if (!summary) return;
    await this.notifier.roundEscalated({
      restaurantId: round.restaurantId,
      roundId: round.id,
      tableId: summary.table.id,
      tableNumber: summary.table.tableNumber,
      captainName: summary.owner ? firstName(summary.owner.name) : null,
      waitedMinutes: Math.max(
        1,
        Math.round((now.getTime() - summary.submittedAt.getTime()) / 60_000),
      ),
    });
    await this.notifier.live(round.restaurantId, [round.sessionId], {
      kind: 'round.escalated',
      tableId: summary.table.id,
      roundId: round.id,
    });
  }
}
