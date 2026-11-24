import {
  ConflictException,
  ForbiddenException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@rms/db';

import type { RateLimitService } from '../common/rate-limit/rate-limit.service';
import type { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';
import type { QrEscalationService } from './qr-escalation.service';
import type { QrGuestRepository, QrTableContext } from './qr-guest.repository';
import { hashGuestSecret, QrGuestService } from './qr-guest.service';
import type { QrNotifier } from './qr-notifier.service';

const TOKEN = 'a'.repeat(64);
const SECRET = 's'.repeat(43);

function table(overrides: Partial<QrTableContext> = {}): QrTableContext {
  return {
    id: 't7',
    restaurantId: 'r1',
    tableNumber: '7',
    isActive: true,
    captainUserId: 'arjun',
    captain: { id: 'arjun', name: 'Arjun Mehta', status: 'ACTIVE', lastSeenAt: new Date() },
    restaurant: {
      id: 'r1',
      name: 'The Spice Room',
      status: 'ACTIVE',
      currency: 'INR',
      defaultGstRate: new Prisma.Decimal(5),
      qrOrderingEnabled: true,
      qrEscalationMinutes: 3,
      guestPhone: '+91 80 4123 4567',
      brandColor: null,
    },
    ...overrides,
  } as QrTableContext;
}

function setup(context: QrTableContext = table()) {
  const tx = {};
  const repository = {
    findTableByToken: jest.fn().mockResolvedValue(context),
    openNoCaptainAlert: jest.fn().mockResolvedValue(true),
    findGuestBySecret: jest.fn().mockResolvedValue({
      guestId: 'g1',
      sessionId: 's1',
      restaurantId: 'r1',
      tableId: 't7',
      displayName: 'Riya',
      sessionStatus: 'OPEN',
      closedAt: null,
    }),
    withLockedSession: jest.fn(
      (_r: string, _s: string, run: (tx: unknown, s: unknown) => unknown) =>
        run(tx, { id: 's1', status: 'OPEN' }),
    ),
    findRoundByIdempotencyKey: jest.fn().mockResolvedValue(null),
    findCartForSubmit: jest.fn().mockResolvedValue([
      {
        id: 'c1',
        menuItemId: 'm1',
        quantity: 2,
        specialInstructions: null,
        addedByGuestId: 'g1',
        menuItem: {
          price: new Prisma.Decimal('320.00'),
          isAvailable: true,
          isActive: true,
          name: 'Paneer Tikka',
          restaurantId: 'r1',
        },
      },
    ]),
    createRound: jest.fn().mockResolvedValue({ id: 'round-1', roundNumber: 1 }),
    findShareForGuest: jest.fn(),
    requestSharePayment: jest.fn(),
    findSessionView: jest.fn().mockResolvedValue(null),
    findUserNames: jest.fn().mockResolvedValue(new Map()),
  };
  const notifier = {
    noCaptainScan: jest.fn(),
    live: jest.fn(),
    roundSubmitted: jest.fn(),
    toCaptain: jest.fn(),
  };
  const realtime = {
    publicConfig: () => ({ key: 'k', cluster: 'ap2' }),
    sessionChannel: (id: string) => `c-${id}`,
  };
  const rateLimit = { consume: jest.fn().mockResolvedValue(undefined) };
  const escalation = { sweep: jest.fn().mockResolvedValue(1) };
  const service = new QrGuestService(
    repository as unknown as QrGuestRepository,
    notifier as unknown as QrNotifier,
    realtime as unknown as QrRealtimePublisher,
    rateLimit as unknown as RateLimitService,
    escalation as unknown as QrEscalationService,
  );
  return { service, repository, notifier, escalation, rateLimit };
}

describe('QrGuestService.state', () => {
  it('maps restaurant, table and captain to the ordering state', () => {
    expect(QrGuestService.state(table())).toBe('OPEN');
    expect(QrGuestService.state(table({ captain: null, captainUserId: null }))).toBe('NO_CAPTAIN');
    expect(
      QrGuestService.state(
        table({ captain: { id: 'x', name: 'X', status: 'INACTIVE', lastSeenAt: null } }),
      ),
    ).toBe('NO_CAPTAIN');
    expect(QrGuestService.state(table({ isActive: false }))).toBe('TABLE_INACTIVE');
    const closed = table();
    closed.restaurant.qrOrderingEnabled = false;
    expect(QrGuestService.state(closed)).toBe('CLOSED');
  });
});

describe('QrGuestService.resolve', () => {
  it('shows the current captain by first name (not encoded in the QR)', async () => {
    const { service } = setup();
    const result = await service.resolve(TOKEN, '1.2.3.4');
    expect(result).toMatchObject({ state: 'OPEN', captainName: 'Arjun' });
    expect(result.restaurant).toMatchObject({ initials: 'SR', brandColor: '#B3401C' });
  });

  it('opens one no-captain alert and notifies managers only when it is new', async () => {
    const { service, repository, notifier } = setup(table({ captain: null, captainUserId: null }));
    await service.resolve(TOKEN, 'ip');
    expect(notifier.noCaptainScan).toHaveBeenCalledTimes(1);
    repository.openNoCaptainAlert.mockResolvedValue(false);
    await service.resolve(TOKEN, 'ip');
    expect(notifier.noCaptainScan).toHaveBeenCalledTimes(1);
  });

  it('is rate limited per IP', async () => {
    const { service, rateLimit } = setup();
    await service.resolve(TOKEN, '9.9.9.9');
    expect(rateLimit.consume).toHaveBeenCalledWith('QR_RESOLVE_MINUTE', 'ip:9.9.9.9', 60, 60_000);
  });
});

describe('QrGuestService guest authentication', () => {
  it('rejects a missing secret', async () => {
    const { service } = setup();
    await expect(service.session(TOKEN, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a secret that belongs to another table or restaurant', async () => {
    const { service, repository } = setup();
    repository.findGuestBySecret.mockResolvedValue({
      guestId: 'g9',
      sessionId: 's9',
      restaurantId: 'other-tenant',
      tableId: 't7',
      displayName: 'Eve',
      sessionStatus: 'OPEN',
      closedAt: null,
    });
    await expect(service.session(TOKEN, SECRET)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repository.findGuestBySecret).toHaveBeenCalledWith(hashGuestSecret(SECRET));
  });

  it('ends a closed visit after its grace period', async () => {
    const { service, repository } = setup();
    repository.findGuestBySecret.mockResolvedValue({
      guestId: 'g1',
      sessionId: 's1',
      restaurantId: 'r1',
      tableId: 't7',
      displayName: 'Riya',
      sessionStatus: 'CLOSED',
      closedAt: new Date(Date.now() - 3 * 60 * 60_000),
    });
    await expect(service.session(TOKEN, SECRET)).rejects.toBeInstanceOf(GoneException);
  });
});

describe('QrGuestService.submitRound', () => {
  it('prices from the menu, routes to the table captain and notifies only them', async () => {
    const { service, repository, notifier, escalation } = setup();
    await service
      .submitRound(TOKEN, SECRET, { idempotencyKey: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })
      .catch(() => undefined);
    const created = repository.createRound.mock.calls[0][1];
    expect(created.ownerCaptainUserId).toBe('arjun');
    expect(created.subtotal.toFixed(2)).toBe('640.00');
    expect(created.items[0].unitPrice.toFixed(2)).toBe('320.00');
    expect(created.escalateAt.getTime() - created.submittedAt.getTime()).toBe(3 * 60_000);
    expect(notifier.roundSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ captainUserId: 'arjun', total: '672.00', itemCount: 2 }),
    );
    expect(escalation.sweep).not.toHaveBeenCalled();
  });

  it('escalates straight to managers when the captain is unavailable', async () => {
    const away = table({
      captain: {
        id: 'arjun',
        name: 'Arjun',
        status: 'ACTIVE',
        lastSeenAt: new Date(Date.now() - 60 * 60_000),
      },
    });
    const { service, repository, escalation } = setup(away);
    await service
      .submitRound(TOKEN, SECRET, { idempotencyKey: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })
      .catch(() => undefined);
    const created = repository.createRound.mock.calls[0][1];
    expect(created.escalateAt.getTime()).toBe(created.submittedAt.getTime());
    expect(escalation.sweep).toHaveBeenCalledWith('r1');
  });

  it('is idempotent: a repeated key creates nothing and notifies nobody', async () => {
    const { service, repository, notifier } = setup();
    repository.findRoundByIdempotencyKey.mockResolvedValue({ id: 'round-1' });
    await service
      .submitRound(TOKEN, SECRET, { idempotencyKey: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })
      .catch(() => undefined);
    expect(repository.createRound).not.toHaveBeenCalled();
    expect(notifier.roundSubmitted).not.toHaveBeenCalled();
  });

  it('refuses sold-out dishes and tables without a captain', async () => {
    const { service, repository } = setup();
    repository.findCartForSubmit.mockResolvedValue([
      {
        id: 'c1',
        menuItemId: 'm1',
        quantity: 1,
        specialInstructions: null,
        addedByGuestId: 'g1',
        menuItem: {
          price: new Prisma.Decimal('100'),
          isAvailable: false,
          isActive: true,
          name: 'Hara Bhara Kebab',
          restaurantId: 'r1',
        },
      },
    ]);
    await expect(
      service.submitRound(TOKEN, SECRET, {
        idempotencyKey: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      }),
    ).rejects.toThrow('Hara Bhara Kebab is sold out today');
    const blocked = setup(table({ captain: null, captainUserId: null }));
    await expect(
      blocked.service.submitRound(TOKEN, SECRET, {
        idempotencyKey: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('QrGuestService.requestPayment', () => {
  it("never lets a guest act on someone else's share", async () => {
    const { service, repository } = setup();
    repository.findShareForGuest.mockResolvedValue({
      id: 'sh1',
      status: 'UNPAID',
      guestId: 'g2',
      amount: new Prisma.Decimal(491),
    });
    await expect(
      service.requestPayment(TOKEN, SECRET, 'sh1', { method: 'UPI' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.requestSharePayment).not.toHaveBeenCalled();
  });

  it('only asks the captain to collect; it never marks the share paid', async () => {
    const { service, repository, notifier } = setup();
    repository.findShareForGuest.mockResolvedValue({
      id: 'sh1',
      status: 'UNPAID',
      guestId: null,
      amount: new Prisma.Decimal(491),
    });
    await service.requestPayment(TOKEN, SECRET, 'sh1', { method: 'UPI' }).catch(() => undefined);
    expect(repository.requestSharePayment).toHaveBeenCalledWith({}, 'sh1', 'g1', 'UPI', 'Riya');
    expect(notifier.toCaptain).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'payment',
        captainUserId: 'arjun',
        body: 'Riya wants to pay ₹491 by UPI.',
      }),
    );
  });
});
