import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { orderListQuerySchema } from '@rms/api-contract';
import { Prisma } from '@rms/db';
import { Permission } from '@rms/permissions';

import type { Actor } from '../common/auth/authenticated-request';
import type { NotificationsService } from '../notifications/notifications.service';
import type { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';
import type { CaptainOrderRecord, OrderListRecord, OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

const actor = { userId: 'captain-1', restaurantId: 'r1' } as unknown as Actor;
const D = (v: string): Prisma.Decimal => new Prisma.Decimal(v);

function record(overrides: Partial<CaptainOrderRecord> = {}): CaptainOrderRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'SUBMITTED',
    openedAt: new Date('2026-11-24T10:00:00Z'),
    completedAt: null,
    table: { id: '22222222-2222-4222-8222-222222222222', tableNumber: 'T2' },
    bill: null,
    kots: [{ status: 'READY' }, { status: 'PREPARING' }, { status: 'READY' }],
    items: [
      { quantity: 2, unitPrice: D('150.00'), status: 'ACTIVE', menuItem: { name: 'Naan' } },
      { quantity: 1, unitPrice: D('300.00'), status: 'CANCELLED', menuItem: { name: 'Dal' } },
      { quantity: 1, unitPrice: D('50.00'), status: 'ACTIVE', menuItem: { name: 'Naan' } },
    ],
    ...overrides,
  } as CaptainOrderRecord;
}

function setup(result: unknown) {
  const findCaptainOrders = jest.fn().mockResolvedValue(result);
  const repository = { findCaptainOrders } as unknown as OrdersRepository;
  const service = new OrdersService(
    repository,
    {} as NotificationsService,
    { publish: jest.fn() } as unknown as QrRealtimePublisher,
  );
  return { service, findCaptainOrders };
}

describe('OrdersService.captainOrders', () => {
  it('scopes the query to the calling captain', async () => {
    const { service, findCaptainOrders } = setup({
      items: [],
      openCount: 0,
      closedCount: 0,
      currency: 'INR',
    });
    await service.captainOrders(actor, { view: 'closed' });
    expect(findCaptainOrders).toHaveBeenCalledWith('r1', 'captain-1', 'closed');
  });

  it('summarises active lines and ticket states', async () => {
    const { service } = setup({ items: [record()], openCount: 1, closedCount: 4, currency: 'INR' });
    const response = await service.captainOrders(actor, { view: 'open' });
    expect(response).toMatchObject({ openCount: 1, closedCount: 4, currency: 'INR' });
    expect(response.data[0]).toMatchObject({
      itemCount: 3,
      itemNames: ['Naan'],
      kotCounts: { pending: 0, preparing: 1, ready: 2, completed: 0 },
      total: '350.00',
      bill: null,
    });
  });

  it('uses the paid bill total for a settled order', async () => {
    const { service } = setup({
      items: [
        record({
          status: 'COMPLETED',
          bill: { billNumber: 'B-7', status: 'PAID', totalAmount: D('413.00') },
        }),
      ],
      openCount: 0,
      closedCount: 1,
      currency: 'INR',
    });
    const response = await service.captainOrders(actor, { view: 'closed' });
    expect(response.data[0]).toMatchObject({
      total: '413.00',
      bill: { billNumber: 'B-7', status: 'PAID' },
    });
  });

  it('404s when the restaurant is gone', async () => {
    const { service } = setup(null);
    await expect(service.captainOrders(actor, { view: 'open' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('OrdersService.list', () => {
  const OTHER_CAPTAIN = '33333333-3333-4333-8333-333333333333';
  const query = orderListQuerySchema.parse({ captainId: OTHER_CAPTAIN });

  function listActor(overrides: Partial<Actor>): Actor {
    return {
      userId: 'u1',
      restaurantId: 'r1',
      roleId: 'role1',
      role: 'Custom',
      isOwner: false,
      permissions: [Permission.ORDER_READ],
      emailVerifiedAt: null,
      ...overrides,
    };
  }

  function setupList(result: unknown = { items: [], total: 0, currency: 'INR', timezone: 'UTC' }) {
    const findOrderList = jest.fn().mockResolvedValue(result);
    const service = new OrdersService(
      { findOrderList } as unknown as OrdersRepository,
      {} as NotificationsService,
      { publish: jest.fn() } as unknown as QrRealtimePublisher,
    );
    return { service, findOrderList };
  }

  it('forces a captain onto their own tables, ignoring the requested captain', async () => {
    const { service, findOrderList } = setupList();
    await service.list(
      listActor({ permissions: [Permission.ORDER_READ, Permission.TABLE_BE_CAPTAIN] }),
      query,
    );
    expect(findOrderList).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ captainUserId: 'u1' }),
    );
  });

  it('lets a captain assigner filter by any captain, or see every order', async () => {
    const { service, findOrderList } = setupList();
    const manager = listActor({
      permissions: [Permission.ORDER_READ, Permission.TABLE_ASSIGN_CAPTAIN],
    });
    await service.list(manager, query);
    expect(findOrderList).toHaveBeenLastCalledWith(
      'r1',
      expect.objectContaining({ captainUserId: OTHER_CAPTAIN }),
    );
    await service.list(manager, orderListQuerySchema.parse({}));
    expect(findOrderList.mock.lastCall?.[1]).not.toHaveProperty('captainUserId');
  });

  it('shows the owner every order', async () => {
    const { service, findOrderList } = setupList();
    await service.list(
      listActor({ isOwner: true, permissions: [] }),
      orderListQuerySchema.parse({}),
    );
    expect(findOrderList.mock.lastCall?.[1]).not.toHaveProperty('captainUserId');
  });

  it('403s roles that are neither captains nor captain assigners', async () => {
    const { service, findOrderList } = setupList();
    await expect(service.list(listActor({}), query)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findOrderList).not.toHaveBeenCalled();
  });

  it('maps rows with their captain, page meta, currency and timezone', async () => {
    const row = {
      ...record(),
      table: {
        id: '22222222-2222-4222-8222-222222222222',
        tableNumber: 'T2',
        captain: { id: OTHER_CAPTAIN, name: 'Isha Rao' },
      },
    } as OrderListRecord;
    const { service } = setupList({
      items: [row],
      total: 41,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    const response = await service.list(
      listActor({ isOwner: true, permissions: [] }),
      orderListQuerySchema.parse({ page: 2 }),
    );
    expect(response).toMatchObject({
      meta: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(response.data[0]).toMatchObject({
      table: { id: '22222222-2222-4222-8222-222222222222', tableNumber: 'T2' },
      captain: { id: OTHER_CAPTAIN, name: 'Isha Rao' },
      total: '350.00',
    });
    expect(response.data[0]?.table).not.toHaveProperty('captain');
  });

  it('rejects a start date after the end date', () => {
    expect(orderListQuerySchema.safeParse({ from: '2026-11-26', to: '2026-11-25' }).success).toBe(
      false,
    );
    expect(orderListQuerySchema.safeParse({ from: '2026-11-25' }).success).toBe(true);
  });
});

describe('OrdersService.updateKotStatus · QR tickets (REST-88)', () => {
  const actor = { userId: 'chef', restaurantId: 'r1' } as unknown as Actor;
  function setupKot(ticket: Record<string, unknown>) {
    const record = {
      id: 'k1',
      orderId: 'o1',
      kotNumber: 'KOT-000001',
      destination: 'KITCHEN',
      status: 'PREPARING',
      createdAt: new Date(),
      items: [],
      order: { table: { id: 't7', tableNumber: '7', section: { id: 's', name: 'Main' } } },
      source: 'QR',
      guestNotifiedAt: null,
      approvedByUser: { name: 'Arjun Mehta' },
      qrRoundId: 'round-1',
      qrRound: { sessionId: 'visit-1', tableId: 't7' },
      ...ticket,
    };
    const repository = {
      withLockedKot: (_r: string, _id: string, run: (c: unknown) => unknown) =>
        run({ kot: { ...record, status: 'PREPARING' }, setStatus: async () => record }),
    } as unknown as OrdersRepository;
    const publish = jest.fn().mockResolvedValue(undefined);
    const service = new OrdersService(
      repository,
      { ticketReady: jest.fn() } as unknown as NotificationsService,
      { publish } as unknown as QrRealtimePublisher,
    );
    return { service, publish };
  }

  it('tells the guest "on its way" once the whole round is ready', async () => {
    const { service, publish } = setupKot({ status: 'READY', guestNotifiedAt: new Date() });
    await service.updateKotStatus(actor, 'k1', { status: 'READY', expectedStatus: 'PREPARING' });
    expect(publish).toHaveBeenCalledWith('r1', ['visit-1'], {
      kind: 'round.ready',
      tableId: 't7',
      roundId: 'round-1',
    });
  });

  it('sends plain kitchen progress while another ticket of the round is still cooking', async () => {
    const { service, publish } = setupKot({ status: 'READY', guestNotifiedAt: null });
    await service.updateKotStatus(actor, 'k1', { status: 'READY', expectedStatus: 'PREPARING' });
    expect(publish).toHaveBeenCalledWith(
      'r1',
      ['visit-1'],
      expect.objectContaining({ kind: 'round.kitchen' }),
    );
  });

  it('publishes nothing for staff-entered tickets', async () => {
    const { service, publish } = setupKot({
      source: 'STAFF',
      qrRound: null,
      qrRoundId: null,
      status: 'READY',
    });
    await service.updateKotStatus(actor, 'k1', { status: 'READY', expectedStatus: 'PREPARING' });
    expect(publish).not.toHaveBeenCalled();
  });
});
