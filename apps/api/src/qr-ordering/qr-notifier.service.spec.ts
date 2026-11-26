import { NotificationType } from '@rms/db';
import { Permission } from '@rms/permissions';

import type { NotificationsService } from '../notifications/notifications.service';
import type { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';
import { QrNotifier } from './qr-notifier.service';

function setup(managers: string[] = ['m1', 'm2']) {
  const deliver = jest.fn().mockResolvedValue(undefined);
  const usersWith = jest.fn().mockResolvedValue(managers);
  const publish = jest.fn().mockResolvedValue(undefined);
  const notifier = new QrNotifier(
    { deliver, usersWith } as unknown as NotificationsService,
    { publish } as unknown as QrRealtimePublisher,
  );
  return { notifier, deliver, usersWith, publish };
}

describe('QrNotifier targeting (REST-88 routing contract)', () => {
  it('sends a new round only to the owner captain, never broadcast', async () => {
    const { notifier, deliver, usersWith } = setup();
    await notifier.roundSubmitted({
      restaurantId: 'r1',
      captainUserId: 'arjun',
      roundId: 'round-1',
      tableId: 't7',
      tableNumber: '7',
      roundNumber: 2,
      itemCount: 3,
      total: '326.00',
    });
    expect(usersWith).not.toHaveBeenCalled();
    expect(deliver).toHaveBeenCalledTimes(1);
    const [restaurantId, recipients, payload, push] = deliver.mock.calls[0];
    expect(restaurantId).toBe('r1');
    expect(recipients).toEqual(['arjun']);
    expect(payload).toMatchObject({
      type: NotificationType.QR_ORDER_SUBMITTED,
      title: 'New guest order · Table 7',
      body: 'Round 2 · 3 items · ₹326. Tap to review.',
    });
    expect(push).toMatchObject({ url: '/qr-orders/rounds/round-1' });
    expect(push.silent).toBeUndefined();
  });

  it('sends escalations to managers (qr-order:manage) with the waiting time and captain', async () => {
    const { notifier, deliver, usersWith } = setup(['meera']);
    await notifier.roundEscalated({
      restaurantId: 'r1',
      roundId: 'round-1',
      tableId: 't7',
      tableNumber: '7',
      captainName: 'Arjun',
      waitedMinutes: 3,
    });
    expect(usersWith).toHaveBeenCalledWith('r1', Permission.QR_ORDER_MANAGE);
    expect(deliver.mock.calls[0][1]).toEqual(['meera']);
    expect(deliver.mock.calls[0][2].title).toBe('Order waiting 3m at Table 7 · Captain: Arjun');
  });

  it('alerts managers about a no-captain scan silently (no chime or vibration)', async () => {
    const { notifier, deliver, usersWith } = setup(['meera']);
    await notifier.noCaptainScan({ restaurantId: 'r1', tableId: 't7', tableNumber: '7' });
    expect(usersWith).toHaveBeenCalledWith('r1', Permission.QR_ORDER_MANAGE);
    expect(deliver.mock.calls[0][2]).toMatchObject({
      type: NotificationType.QR_NO_CAPTAIN,
      title: 'A guest scanned Table 7, which has no captain assigned',
    });
    expect(deliver.mock.calls[0][3]).toMatchObject({ silent: true });
  });

  it.each(['bill', 'call', 'payment'] as const)(
    'sends %s requests to the table captain only',
    async (type) => {
      const { notifier, deliver, usersWith } = setup();
      await notifier.toCaptain({
        restaurantId: 'r1',
        captainUserId: 'arjun',
        type,
        sessionId: 's1',
        tableId: 't7',
        tableNumber: '7',
        body: 'x',
      });
      expect(usersWith).not.toHaveBeenCalled();
      expect(deliver.mock.calls[0][1]).toEqual(['arjun']);
    },
  );

  it('pings nobody when the table has no captain', async () => {
    const { notifier, deliver } = setup();
    await notifier.toCaptain({
      restaurantId: 'r1',
      captainUserId: null,
      type: 'bill',
      sessionId: 's1',
      tableId: 't7',
      tableNumber: '7',
      body: 'x',
    });
    expect(deliver).not.toHaveBeenCalled();
  });
});
