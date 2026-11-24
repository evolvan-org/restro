import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@rms/db';

import type { Actor } from '../common/auth/authenticated-request';
import type { NotificationsService } from '../notifications/notifications.service';
import type { CaptainOrderRecord, OrdersRepository } from './orders.repository';
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
  const service = new OrdersService(repository, {} as NotificationsService);
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
