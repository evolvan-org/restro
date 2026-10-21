import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const orderSelect = {
  id: true,
  tableId: true,
  table: { select: { id: true, tableNumber: true } },
  reservationId: true,
  createdByUserId: true,
  status: true,
  notes: true,
  openedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      menuItemId: true,
      menuItem: { select: { name: true, itemType: true } },
      quantity: true,
      unitPrice: true,
      specialInstructions: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.OrderSelect;

export type OrderRecord = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

type NewOrder = {
  createdByUserId: string;
  reservationId: string | null;
  status: 'OPEN';
  openedAt: Date;
};

export type OrderOpeningContext = {
  table: { id: string; isActive: boolean } | null;
  reservation: { id: string; tableId: string | null; status: string } | null;
  existingOrder: OrderRecord | null;
  create: (details: NewOrder) => Promise<OrderRecord>;
};

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCurrent(restaurantId: string, tableId: string): Promise<OrderRecord | null> {
    return this.prisma.order.findFirst({
      where: { restaurantId, tableId, status: 'OPEN' },
      select: orderSelect,
      orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** All opening paths lock the same table before reading or inserting its open order. */
  withLockedTable(
    restaurantId: string,
    tableId: string,
    reservationId: string | undefined,
    open: (context: OrderOpeningContext) => Promise<OrderRecord>,
  ): Promise<OrderRecord> {
    return this.prisma.$transaction(async (tx) => {
      // Match reservation editing's lock order: reservation first, then table.
      if (reservationId) {
        await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${reservationId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      }
      await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;

      const table = await tx.restaurantTable.findFirst({
        where: { id: tableId, restaurantId },
        select: { id: true, isActive: true },
      });
      const reservation = reservationId
        ? await tx.reservation.findFirst({
            where: { id: reservationId, restaurantId },
            select: { id: true, tableId: true, status: true },
          })
        : null;
      const existingOrder = await tx.order.findFirst({
        where: { restaurantId, tableId, status: 'OPEN' },
        select: orderSelect,
        orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
      });

      return open({
        table,
        reservation,
        existingOrder,
        create: (details) =>
          tx.order.create({
            data: { restaurantId, tableId, ...details },
            select: orderSelect,
          }),
      });
    });
  }
}
