import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';
import { setTableLifecycleStatus } from '../common/database/table-lifecycle';

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
      kotItems: { select: { id: true }, take: 1 },
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

const kotSelect = {
  id: true,
  orderId: true,
  kotNumber: true,
  destination: true,
  status: true,
  createdAt: true,
  items: {
    select: {
      id: true,
      orderItemId: true,
      quantity: true,
      status: true,
      orderItem: {
        select: {
          menuItemId: true,
          specialInstructions: true,
          menuItem: { select: { name: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.KotSelect;

export type OrderRecord = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;
export type KotRecord = Prisma.KotGetPayload<{ select: typeof kotSelect }>;

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
  seatAndOccupy: () => Promise<void>;
};

export type LockedOrderContext = {
  order: Pick<OrderRecord, 'id' | 'status'> | null;
  findMenuItem: (
    id: string,
  ) => Promise<{ id: string; price: Prisma.Decimal; isAvailable: boolean } | null>;
  findItem: (id: string) => Promise<{
    id: string;
    status: OrderRecord['items'][number]['status'];
    kotItems: { id: string }[];
  } | null>;
  add: (data: {
    menuItemId: string;
    quantity: number;
    specialInstructions: string | null;
    unitPrice: Prisma.Decimal;
  }) => Promise<string>;
  update: (
    id: string,
    data: { quantity: number } | { specialInstructions: string | null },
  ) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  findUnsentItems: () => Promise<
    {
      id: string;
      quantity: number;
      menuItem: { itemType: 'FOOD' | 'BAR' };
    }[]
  >;
  createKots: (
    createdByUserId: string,
    groups: {
      destination: 'KITCHEN' | 'BAR';
      items: { orderItemId: string; quantity: number }[];
    }[],
  ) => Promise<KotRecord[]>;
  submit: () => Promise<void>;
  refresh: () => Promise<OrderRecord>;
};

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Item edits and future KOT/lifecycle writers must lock the order before checking state. */
  withLockedOrder<T>(
    restaurantId: string,
    orderId: string,
    mutate: (context: LockedOrderContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        // Read only the state needed by the guard while acquiring the lock. Loading the
        // full order here duplicates the final refresh and adds relation queries under lock.
        const orders = await tx.$queryRaw<Pick<OrderRecord, 'id' | 'status'>[]>`
        SELECT id, status FROM orders
        WHERE id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid
        FOR UPDATE
      `;
        const order = orders[0] ?? null;
        return mutate({
          order,
          findMenuItem: (id) =>
            tx.menuItem.findFirst({
              where: { id, restaurantId, isActive: true },
              select: { id: true, price: true, isAvailable: true },
            }),
          findItem: async (id) => {
            await tx.$queryRaw`SELECT id FROM order_items WHERE id = ${id}::uuid AND order_id = ${orderId}::uuid FOR UPDATE`;
            return tx.orderItem.findFirst({
              where: { id, orderId, order: { restaurantId } },
              select: { id: true, status: true, kotItems: { select: { id: true }, take: 1 } },
            });
          },
          add: async (data) => {
            const item = await tx.orderItem.create({
              data: { ...data, orderId, status: 'ACTIVE' },
              select: { id: true },
            });
            return item.id;
          },
          update: async (id, data) => {
            await tx.orderItem.update({
              where: { id, orderId, order: { restaurantId } },
              data,
            });
          },
          cancel: async (id) => {
            await tx.orderItem.update({
              where: { id, orderId, order: { restaurantId } },
              data: { status: 'CANCELLED' },
            });
          },
          findUnsentItems: () =>
            tx.orderItem.findMany({
              where: {
                orderId,
                order: { restaurantId },
                status: 'ACTIVE',
                kotItems: { none: {} },
              },
              select: {
                id: true,
                quantity: true,
                menuItem: { select: { itemType: true } },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            }),
          createKots: async (createdByUserId, groups) => {
            // Serialize the restaurant-wide human-readable sequence without adding a
            // duplicate counter table. The existing unique constraint remains the backstop.
            await tx.$queryRaw`SELECT id FROM restaurants WHERE id = ${restaurantId}::uuid FOR UPDATE`;
            const rows = await tx.$queryRaw<{ currentNumber: bigint }[]>`
              SELECT COALESCE(MAX(SUBSTRING(kot_number FROM 5)::bigint), 0) AS "currentNumber"
              FROM kots
              WHERE restaurant_id = ${restaurantId}::uuid
                AND kot_number ~ '^KOT-[0-9]+$'
            `;
            const firstNumber = Number(rows[0]?.currentNumber ?? 0n) + 1;
            return Promise.all(
              groups.map((group, index) =>
                tx.kot.create({
                  data: {
                    restaurantId,
                    orderId,
                    createdByUserId,
                    kotNumber: `KOT-${String(firstNumber + index).padStart(6, '0')}`,
                    destination: group.destination,
                    status: 'PENDING',
                    items: {
                      create: group.items.map((item) => ({ ...item, status: 'PENDING' })),
                    },
                  },
                  select: kotSelect,
                }),
              ),
            );
          },
          submit: async () => {
            await tx.order.update({
              where: { id: orderId, restaurantId },
              data: { status: 'SUBMITTED' },
            });
          },
          refresh: () =>
            tx.order.findFirstOrThrow({
              where: { id: orderId, restaurantId },
              select: orderSelect,
            }),
        });
      },
      {
        // Includes lock waits and the final relation reads; keep a bounded budget for
        // slower database connections instead of Prisma's default five seconds.
        timeout: 15_000,
      },
    );
  }

  findCurrent(restaurantId: string, tableId: string): Promise<OrderRecord | null> {
    return this.prisma.order.findFirst({
      where: { restaurantId, tableId, status: { in: ['OPEN', 'SUBMITTED'] } },
      select: orderSelect,
      orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
    });
  }

  findById(restaurantId: string, orderId: string): Promise<OrderRecord | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: orderSelect,
    });
  }

  /** All opening paths lock the same table before reading or inserting its open order. */
  withLockedTable(
    restaurantId: string,
    tableId: string,
    reservationId: string,
    open: (context: OrderOpeningContext) => Promise<OrderRecord>,
  ): Promise<OrderRecord> {
    return this.prisma.$transaction(async (tx) => {
      // Match reservation editing's lock order: reservation first, then table.
      await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${reservationId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;

      const table = await tx.restaurantTable.findFirst({
        where: { id: tableId, restaurantId },
        select: { id: true, isActive: true },
      });
      const reservation = await tx.reservation.findFirst({
        where: { id: reservationId, restaurantId },
        select: { id: true, tableId: true, status: true },
      });
      const existingOrder = await tx.order.findFirst({
        where: { restaurantId, tableId, status: { in: ['OPEN', 'SUBMITTED'] } },
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
        seatAndOccupy: async () => {
          if (reservation?.status === 'BOOKED') {
            await tx.reservation.update({
              where: { id: reservation.id, restaurantId },
              data: { status: 'SEATED' },
            });
          }
          await setTableLifecycleStatus(tx, restaurantId, tableId, 'OCCUPIED');
        },
      });
    });
  }

  complete(restaurantId: string, orderId: string): Promise<OrderRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.order.findFirst({
        where: { id: orderId, restaurantId },
        select: { tableId: true, reservationId: true },
      });
      if (!candidate) return null;

      if (candidate.reservationId) {
        await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${candidate.reservationId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      }
      await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${candidate.tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id: orderId, restaurantId },
        select: { id: true, tableId: true, reservationId: true, status: true },
      });
      if (!order || !['OPEN', 'SUBMITTED'].includes(order.status)) return null;

      await tx.order.update({
        where: { id: order.id, restaurantId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (order.reservationId) {
        await tx.reservation.updateMany({
          where: { id: order.reservationId, restaurantId, status: 'SEATED' },
          data: { status: 'COMPLETED' },
        });
      }
      await setTableLifecycleStatus(tx, restaurantId, order.tableId, 'NEEDS_CLEANING');
      return tx.order.findFirst({ where: { id: order.id, restaurantId }, select: orderSelect });
    });
  }
}
