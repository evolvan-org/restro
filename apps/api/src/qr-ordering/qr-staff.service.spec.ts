import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@rms/db';
import { Permission } from '@rms/permissions';

import type { BillsService } from '../bills/bills.service';
import type { Actor } from '../common/auth/authenticated-request';
import type { NotificationsService } from '../notifications/notifications.service';
import type { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';
import type { QrGuestRepository } from './qr-guest.repository';
import type { QrNotifier } from './qr-notifier.service';
import type { QrStaffRepository } from './qr-staff.repository';
import { QrStaffService } from './qr-staff.service';

const captain = (userId: string): Actor =>
  ({
    userId,
    restaurantId: 'r1',
    roleId: 'role',
    role: 'CAPTAIN',
    isOwner: false,
    permissions: [
      Permission.QR_ORDER_READ,
      Permission.QR_ORDER_APPROVE,
      Permission.TABLE_BE_CAPTAIN,
    ],
    emailVerifiedAt: null,
  }) as Actor;
const manager: Actor = {
  ...captain('meera'),
  role: 'MANAGER',
  permissions: [Permission.QR_ORDER_READ, Permission.QR_ORDER_APPROVE, Permission.QR_ORDER_MANAGE],
};

function setup(round: { status: string; ownerCaptainUserId: string | null }) {
  const approveRound = jest
    .fn()
    .mockResolvedValue({ kind: 'approved', kotIds: ['k1', 'k2'], orderId: 'o1' });
  const repository = {
    findRestaurantQrState: jest.fn().mockResolvedValue({
      qrOrderingEnabled: true,
      qrEscalationMinutes: 3,
      defaultGstRate: new Prisma.Decimal(5),
    }),
    withLockedRound: jest.fn((_r: string, _id: string, run: (c: unknown) => unknown) =>
      run({
        round: { id: 'round-1', sessionId: 's1', tableId: 't7', roundNumber: 1, ...round },
        tx: {},
      }),
    ),
    approveRound,
    rejectRound: jest.fn(),
    findRound: jest.fn().mockResolvedValue(null),
    findCaptainCandidate: jest.fn(),
    resolveStaleAlerts: jest.fn().mockResolvedValue(1),
    findAlerts: jest.fn().mockResolvedValue([]),
    countMyWaiting: jest.fn().mockResolvedValue({ count: 0, oldest: null }),
    countOpenAlerts: jest.fn().mockResolvedValue(0),
  };
  const notifications = { ticketSent: jest.fn() };
  const notifier = { live: jest.fn(), roundSubmitted: jest.fn() };
  const service = new QrStaffService(
    repository as unknown as QrStaffRepository,
    {} as QrGuestRepository,
    notifier as unknown as QrNotifier,
    {} as QrRealtimePublisher,
    {} as BillsService,
    notifications as unknown as NotificationsService,
  );
  return { service, repository, notifications, approveRound };
}

describe('QrStaffService.canAct', () => {
  const { service } = setup({ status: 'AWAITING_APPROVAL', ownerCaptainUserId: 'arjun' });
  it('lets the owner captain and managers act; other captains only see', () => {
    expect(service.canAct(captain('arjun'), { ownerCaptainUserId: 'arjun' })).toBe(true);
    expect(service.canAct(captain('priya'), { ownerCaptainUserId: 'arjun' })).toBe(false);
    expect(service.canAct(manager, { ownerCaptainUserId: 'arjun' })).toBe(true);
    expect(
      service.canAct(
        { ...captain('x'), isOwner: true, permissions: [] },
        { ownerCaptainUserId: 'arjun' },
      ),
    ).toBe(true);
  });
});

describe('QrStaffService.approve', () => {
  it('forbids another captain from approving', async () => {
    const { service, approveRound } = setup({
      status: 'AWAITING_APPROVAL',
      ownerCaptainUserId: 'arjun',
    });
    await expect(
      service.approve(captain('priya'), 'round-1', { items: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(approveRound).not.toHaveBeenCalled();
  });

  it('refuses a round that was already decided', async () => {
    const { service } = setup({ status: 'APPROVED', ownerCaptainUserId: 'arjun' });
    await expect(
      service.approve(captain('arjun'), 'round-1', { items: [] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('asks for a reject when every item was removed', async () => {
    const { service, approveRound } = setup({
      status: 'AWAITING_APPROVAL',
      ownerCaptainUserId: 'arjun',
    });
    approveRound.mockResolvedValue({ kind: 'empty' });
    await expect(
      service.approve(captain('arjun'), 'round-1', { items: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets a manager approve an escalated round and sends the KOTs to the stations', async () => {
    const { service, notifications, approveRound } = setup({
      status: 'AWAITING_APPROVAL',
      ownerCaptainUserId: 'arjun',
    });
    await service
      .approve(manager, 'round-1', { items: [{ id: 'i1', quantity: 1, outOfStock: false }] })
      .catch(() => undefined); // detail re-read is not mocked
    expect(approveRound).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        approverUserId: 'meera',
        edits: new Map([['i1', { quantity: 1, outOfStock: false }]]),
      }),
    );
    expect(notifications.ticketSent).toHaveBeenCalledWith('r1', ['k1', 'k2']);
  });
});

describe('QrStaffService.assignCaptain', () => {
  it('rejects users who are not eligible to be captains', async () => {
    const { service, repository } = setup({
      status: 'AWAITING_APPROVAL',
      ownerCaptainUserId: 'arjun',
    });
    repository.findCaptainCandidate.mockResolvedValue({
      id: 'rina',
      name: 'Rina',
      status: 'ACTIVE',
      role: { name: 'RECEPTION', isOwner: false, permissions: [{ permissionKey: 'order:read' }] },
    });
    await expect(
      service.assignCaptain(manager, 't7', { captainUserId: 'rina', moveWaitingOrders: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('QrStaffService alerts', () => {
  it('closes alerts whose cause is gone before listing them', async () => {
    const { service, repository } = setup({
      status: 'AWAITING_APPROVAL',
      ownerCaptainUserId: 'arjun',
    });
    await service.alerts(manager);
    expect(repository.resolveStaleAlerts).toHaveBeenCalledWith('r1', expect.any(Date));
    expect(repository.resolveStaleAlerts.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findAlerts.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('keeps the manager badge count in step, and skips the cleanup for captains', async () => {
    const managerSetup = setup({ status: 'AWAITING_APPROVAL', ownerCaptainUserId: 'arjun' });
    await managerSetup.service.summary(manager);
    expect(managerSetup.repository.resolveStaleAlerts).toHaveBeenCalled();
    const captainSetup = setup({ status: 'AWAITING_APPROVAL', ownerCaptainUserId: 'arjun' });
    await captainSetup.service.summary(captain('arjun'));
    expect(captainSetup.repository.resolveStaleAlerts).not.toHaveBeenCalled();
  });
});
