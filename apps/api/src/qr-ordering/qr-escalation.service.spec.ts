import { Prisma } from '@rms/db';

import { QrEscalationService } from './qr-escalation.service';
import type { QrNotifier } from './qr-notifier.service';
import type { QrStaffRepository } from './qr-staff.repository';

function setup(claimed: { id: string; restaurantId: string; sessionId: string }[]) {
  const escalateDueRounds = jest.fn().mockResolvedValue(claimed);
  const findEscalatedRoundSummary = jest.fn().mockResolvedValue({
    roundNumber: 1,
    subtotal: new Prisma.Decimal(100),
    submittedAt: new Date(Date.now() - 4 * 60_000),
    table: { id: 't7', tableNumber: '7' },
    owner: { name: 'Arjun Mehta' },
    items: [{ quantity: 1 }],
    session: { _count: { guests: 2 } },
    restaurant: { qrEscalationMinutes: 3, defaultGstRate: new Prisma.Decimal(5) },
  });
  const roundEscalated = jest.fn().mockResolvedValue(undefined);
  const live = jest.fn().mockResolvedValue(undefined);
  const service = new QrEscalationService(
    { escalateDueRounds, findEscalatedRoundSummary } as unknown as QrStaffRepository,
    { roundEscalated, live } as unknown as QrNotifier,
  );
  return { service, escalateDueRounds, roundEscalated, live };
}

describe('QrEscalationService.sweep', () => {
  it('notifies managers once per claimed round, with the captain’s first name', async () => {
    const { service, roundEscalated, live } = setup([
      { id: 'round-1', restaurantId: 'r1', sessionId: 's1' },
    ]);
    await expect(service.sweep()).resolves.toBe(1);
    expect(roundEscalated).toHaveBeenCalledWith(
      expect.objectContaining({ roundId: 'round-1', captainName: 'Arjun', waitedMinutes: 4 }),
    );
    expect(live).toHaveBeenCalledWith(
      'r1',
      ['s1'],
      expect.objectContaining({ kind: 'round.escalated' }),
    );
  });

  it('does nothing when no round is due (claims are atomic in the database)', async () => {
    const { service, roundEscalated } = setup([]);
    await expect(service.sweep('r1')).resolves.toBe(0);
    expect(roundEscalated).not.toHaveBeenCalled();
  });

  it('never throws out of the timer', async () => {
    const { service, escalateDueRounds } = setup([]);
    escalateDueRounds.mockRejectedValueOnce(new Error('db down'));
    await expect(service.sweep()).resolves.toBe(0);
  });
});
