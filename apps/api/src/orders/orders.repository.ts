import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CaptainOrderView,
  DiscardOrderRequest,
  KotDestination,
  KotQueueQuery,
  KotStatus,
  OrderListQuery,
  OrderSelectionSnapshot,
  PreparationHistoryQuery,
  ServingType,
  VoidOrderItemRequest,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';
import { Permission } from '@rms/permissions';

import { actorCan } from '../common/auth/actor-permissions';
import type { Actor } from '../common/auth/authenticated-request';
import {
  INVENTORY_LOCK_WAITER_TIMEOUT_MS,
  lockRestaurantInventory,
} from '../common/database/inventory-lock';
import { createKotTickets, type KotGroup } from '../common/database/kot-tickets';
import { lockOrderLifecycle } from '../common/database/order-lifecycle';
import { PrismaService } from '../common/database/prisma.service';
import { reconcileTableStatus, setTableLifecycleStatus } from '../common/database/table-lifecycle';
import { recordTicketStockUsage } from '../stock/ticket-stock-usage';
import { canVoidTicketLines } from './order-corrections';
import { recipeObservationSelect } from './order-selections';

const orderSelect = {
  id: true,
  tableId: true,
  table: {
    select: {
      id: true,
      tableNumber: true,
      qrSessions: { where: { status: 'OPEN' }, select: { id: true }, take: 1 },
    },
  },
  reservationId: true,
  createdByUserId: true,
  status: true,
  notes: true,
  openedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  bill: { select: { id: true } },
  kots: {
    select: {
      status: true,
      items: { where: { voidedAt: null }, select: { id: true }, take: 1 },
    },
  },
  items: {
    select: {
      id: true,
      menuItemId: true,
      kotItems: {
        where: { voidedAt: null },
        select: {
          quantity: true,
          stockUsageIssue: true,
          status: true,
          kot: { select: { status: true, source: true } },
        },
      },
      menuItem: { select: { name: true, itemType: true } },
      quantity: true,
      unitPrice: true,
      nameSnapshot: true,
      itemTypeSnapshot: true,
      selectionSnapshot: true,
      sentQuantity: true,
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
  correctionOf: true,
  status: true,
  printStatus: true,
  printAttemptAt: true,
  controlVersion: true,
  acceptedAt: true,
  heldAt: true,
  holdReason: true,
  isPriority: true,
  targetSeconds: true,
  createdAt: true,
  items: {
    select: {
      id: true,
      orderItemId: true,
      quantity: true,
      componentMenuItemId: true,
      nameSnapshot: true,
      instructionsSnapshot: true,
      voidedAt: true,
      voidReason: true,
      stockUsageIssue: true,
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

export const kotQueueSelect = {
  ...kotSelect,
  source: true,
  guestNotifiedAt: true,
  approvedByUser: { select: { name: true } },
  qrRoundId: true,
  qrRound: { select: { sessionId: true, tableId: true } },
  order: {
    select: {
      table: {
        select: {
          id: true,
          tableNumber: true,
          section: { select: { id: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.KotSelect;

const captainOrderSelect = {
  id: true,
  status: true,
  openedAt: true,
  completedAt: true,
  table: { select: { id: true, tableNumber: true } },
  bill: { select: { billNumber: true, status: true, totalAmount: true } },
  kots: { where: { items: { some: { voidedAt: null } } }, select: { status: true } },
  items: {
    select: {
      quantity: true,
      unitPrice: true,
      status: true,
      nameSnapshot: true,
      menuItem: { select: { name: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.OrderSelect;

const orderListSelect = {
  ...captainOrderSelect,
  table: {
    select: { id: true, tableNumber: true, captain: { select: { id: true, name: true } } },
  },
} satisfies Prisma.OrderSelect;

export type OrderRecord = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;
export type CaptainOrderRecord = Prisma.OrderGetPayload<{ select: typeof captainOrderSelect }>;
export type OrderListRecord = Prisma.OrderGetPayload<{ select: typeof orderListSelect }>;
/** List filters after the service resolved the caller's scope (`captainUserId`). */
export type OrderListFilters = Omit<OrderListQuery, 'captainId'> & { captainUserId?: string };
export type OrderListResult = {
  items: OrderListRecord[];
  total: number;
  currency: string;
  timezone: string;
};
export type CaptainOrdersResult = {
  items: CaptainOrderRecord[];
  openCount: number;
  closedCount: number;
  currency: string;
};
export type KotRecord = Prisma.KotGetPayload<{ select: typeof kotSelect }>;
export type KotQueueRecord = Prisma.KotGetPayload<{ select: typeof kotQueueSelect }>;

const orderingMenuSelect = {
  ...recipeObservationSelect,
  name: true,
  price: true,
  itemType: true,
  isAvailable: true,
  customizations: true,
} satisfies Prisma.MenuItemSelect;

export type OrderingMenuRecord = Prisma.MenuItemGetPayload<{ select: typeof orderingMenuSelect }>;
export type NewOrderLine = {
  menuItemId: string;
  quantity: number;
  specialInstructions: string | null;
  unitPrice: Prisma.Decimal;
  nameSnapshot: string;
  itemTypeSnapshot: ServingType;
  selectionSnapshot: OrderSelectionSnapshot;
  recipeSnapshot: Prisma.InputJsonValue;
  configurationKey: string;
};

export type NewKotLine = {
  orderItemId: string;
  quantity: number;
  componentMenuItemId?: string;
  nameSnapshot?: string;
  instructionsSnapshot?: string | null;
};

type NewOrder = {
  createdByUserId: string;
  reservationId: string | null;
  status: 'OPEN';
  openedAt: Date;
};

export type OrderOpeningContext = {
  table: { id: string; isActive: boolean; currentStatus: { code: string } } | null;
  reservation: { id: string; tableId: string | null; status: string } | null;
  existingOrder: OrderRecord | null;
  create: (details: NewOrder) => Promise<OrderRecord>;
  seatAndOccupy: () => Promise<void>;
};

export type LockedOrderContext = {
  order: Pick<OrderRecord, 'id' | 'status'> | null;
  findMenuItem: (id: string) => Promise<OrderingMenuRecord | null>;
  findItem: (id: string) => Promise<{
    id: string;
    status: OrderRecord['items'][number]['status'];
    quantity: number;
    sentQuantity: number | null;
    selectionSnapshot: Prisma.JsonValue;
    kotItems: { quantity: number }[];
  } | null>;
  findMergeableItem: (match: {
    menuItemId: string;
    specialInstructions: string | null;
    unitPrice: Prisma.Decimal;
    configurationKey: string;
  }) => Promise<{ id: string; quantity: number } | null>;
  add: (data: NewOrderLine) => Promise<string>;
  update: (
    id: string,
    data: { quantity: number } | { specialInstructions: string | null },
  ) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  findActiveItems: () => Promise<
    {
      id: string;
      quantity: number;
      sentQuantity: number | null;
      menuItemId: string;
      nameSnapshot: string | null;
      itemTypeSnapshot: ServingType | null;
      selectionSnapshot: Prisma.JsonValue;
      specialInstructions: string | null;
      kotItems: { quantity: number }[];
      menuItem: { itemType: 'FOOD' | 'BAR' };
    }[]
  >;
  createKots: (
    createdByUserId: string,
    groups: {
      destination: 'KITCHEN' | 'BAR';
      items: NewKotLine[];
    }[],
  ) => Promise<KotRecord[]>;
  markSent: (items: { id: string; quantity: number }[]) => Promise<void>;
  submit: () => Promise<void>;
  refresh: () => Promise<OrderRecord>;
};

export type PreparationChange = Partial<
  Pick<
    Prisma.KotUncheckedUpdateInput,
    'acceptedAt' | 'heldAt' | 'holdReason' | 'isPriority' | 'targetSeconds'
  >
>;

export type LockedKotContext = {
  kot: KotQueueRecord | null;
  /** Writes the KOT and every one of its items in this transaction; completedAt is stamped on COMPLETED. */
  setStatus: (status: KotStatus) => Promise<KotQueueRecord>;
  setPreparation: (
    action: string,
    change: PreparationChange,
    reason?: string,
  ) => Promise<KotQueueRecord>;
};

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Item edits and future KOT/lifecycle writers must lock the order before checking state. */
  withLockedOrder<T>(
    restaurantId: string,
    orderId: string,
    mutate: (context: LockedOrderContext) => Promise<T>,
    captureMenuSnapshot = false,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        if (captureMenuSnapshot) await lockRestaurantInventory(tx, restaurantId);
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
              where: { id, restaurantId, isActive: true, category: { restaurantId } },
              select: orderingMenuSelect,
            }),
          findItem: async (id) => {
            await tx.$queryRaw`SELECT id FROM order_items WHERE id = ${id}::uuid AND order_id = ${orderId}::uuid FOR UPDATE`;
            return tx.orderItem.findFirst({
              where: { id, orderId, order: { restaurantId } },
              select: {
                id: true,
                status: true,
                quantity: true,
                sentQuantity: true,
                selectionSnapshot: true,
                kotItems: { where: { voidedAt: null }, select: { quantity: true } },
              },
            });
          },
          findMergeableItem: ({ menuItemId, specialInstructions, unitPrice, configurationKey }) =>
            tx.orderItem.findFirst({
              where: {
                orderId,
                order: { restaurantId },
                menuItemId,
                specialInstructions,
                unitPrice,
                configurationKey,
                status: 'ACTIVE',
              },
              select: { id: true, quantity: true },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            }),
          add: async (data) => {
            const item = await tx.orderItem.create({
              data: { ...data, orderId, status: 'ACTIVE', sentQuantity: 0 },
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
          findActiveItems: () =>
            tx.orderItem.findMany({
              where: {
                orderId,
                order: { restaurantId },
                status: 'ACTIVE',
              },
              select: {
                id: true,
                quantity: true,
                sentQuantity: true,
                menuItemId: true,
                nameSnapshot: true,
                itemTypeSnapshot: true,
                selectionSnapshot: true,
                specialInstructions: true,
                kotItems: { where: { voidedAt: null }, select: { quantity: true } },
                menuItem: { select: { itemType: true } },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            }),
          createKots: (createdByUserId, groups) =>
            createKotTickets(tx, {
              restaurantId,
              orderId,
              createdByUserId,
              groups,
              select: kotSelect,
            }),
          submit: async () => {
            await tx.order.update({
              where: { id: orderId, restaurantId },
              data: { status: 'SUBMITTED' },
            });
          },
          markSent: async (items) => {
            for (const item of items) {
              await tx.orderItem.update({
                where: { id: item.id, orderId, order: { restaurantId } },
                data: { sentQuantity: item.quantity },
              });
            }
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
        timeout: captureMenuSnapshot ? INVENTORY_LOCK_WAITER_TIMEOUT_MS : 15_000,
      },
    );
  }

  discard(actor: Actor, orderId: string, { reason }: DiscardOrderRequest): Promise<OrderRecord> {
    const { restaurantId, userId } = actor;
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await lockOrderLifecycle(tx, restaurantId, orderId);
        if (!locked) throw new NotFoundException('Order not found');
        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: {
            status: true,
            createdByUserId: true,
            seatedReservationOnOpen: true,
            discardReason: true,
            table: {
              select: {
                captainUserId: true,
                qrSessions: { where: { status: 'OPEN' }, select: { id: true }, take: 1 },
              },
            },
            bill: { select: { id: true } },
            kots: { select: { id: true }, take: 1 },
          },
        });
        if (
          !actorCan(actor, Permission.TABLE_ASSIGN_CAPTAIN) &&
          order.createdByUserId !== userId &&
          order.table.captainUserId !== userId
        ) {
          throw new ForbiddenException(
            'Only the order creator, assigned captain, or a manager can discard this order',
          );
        }
        if (order.status === 'CANCELLED' && order.discardReason) {
          return tx.order.findUniqueOrThrow({ where: { id: orderId }, select: orderSelect });
        }
        if (
          order.status !== 'OPEN' ||
          order.kots.length ||
          order.bill ||
          order.table.qrSessions.length
        ) {
          throw new ConflictException(
            'Only an unfired order without a bill or live QR visit can be discarded',
          );
        }
        await tx.orderItem.updateMany({
          where: { orderId, status: 'ACTIVE' },
          data: { status: 'CANCELLED' },
        });
        const discarded = await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'CANCELLED',
            discardReason: reason,
            discardedByUserId: userId,
            completedAt: new Date(),
          },
          select: orderSelect,
        });
        // Preserve guests seated independently of this order, including orders created before tracking.
        if (order.seatedReservationOnOpen && locked.reservationId) {
          await tx.reservation.updateMany({
            where: {
              id: locked.reservationId,
              restaurantId,
              tableId: locked.tableId,
              status: 'SEATED',
            },
            data: { status: 'BOOKED' },
          });
        }
        await reconcileTableStatus(tx, restaurantId, locked.tableId);
        return discarded;
      },
      { timeout: 15_000 },
    );
  }

  voidPendingItem(
    actor: Actor,
    orderId: string,
    itemId: string,
    { reason, expectedUpdatedAt }: VoidOrderItemRequest,
  ): Promise<{ order: OrderRecord; corrections: KotRecord[] }> {
    const { restaurantId, userId } = actor;
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ status: OrderRecord['status'] }[]>`
        SELECT status FROM orders WHERE id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE
      `;
        if (!locked[0]) throw new NotFoundException('Order not found');
        if (
          locked[0].status !== 'SUBMITTED' ||
          (await tx.bill.findFirst({
            where: { orderId, restaurantId },
            select: { id: true },
          }))
        ) {
          throw new ConflictException('Only submitted orders can be corrected before billing');
        }
        const item = await tx.orderItem.findFirst({
          where: { id: itemId, orderId },
          select: {
            status: true,
            quantity: true,
            sentQuantity: true,
            updatedAt: true,
            kotItems: {
              where: { voidedAt: null },
              select: {
                id: true,
                orderItemId: true,
                quantity: true,
                status: true,
                componentMenuItemId: true,
                nameSnapshot: true,
                instructionsSnapshot: true,
                kot: {
                  select: {
                    id: true,
                    kotNumber: true,
                    destination: true,
                    status: true,
                    source: true,
                  },
                },
              },
            },
          },
        });
        if (!item) throw new NotFoundException('Order item not found');
        if (item.updatedAt.toISOString() !== expectedUpdatedAt) {
          throw new ConflictException('This order item changed. Refresh the order and try again');
        }
        if (item.status !== 'ACTIVE' || !canVoidTicketLines(item.kotItems)) {
          throw new ConflictException(
            'Only staff-entered items still pending at every station can be voided',
          );
        }
        const sent =
          item.sentQuantity ?? item.kotItems.reduce((total, line) => total + line.quantity, 0);
        if (sent < 1 || sent > item.quantity) {
          throw new ConflictException('The sent quantity could not be verified');
        }
        const voidedAt = new Date();
        const audit = { voidedAt, voidedByUserId: userId, voidReason: reason };
        const correctionGroups = new Map<string, KotGroup>();
        for (const {
          kot,
          orderItemId,
          quantity,
          componentMenuItemId,
          nameSnapshot,
          instructionsSnapshot,
        } of item.kotItems) {
          let group = correctionGroups.get(kot.id);
          if (!group) {
            group = { destination: kot.destination, correctionOf: kot.kotNumber, items: [] };
            correctionGroups.set(kot.id, group);
          }
          group.items.push({
            orderItemId,
            quantity,
            componentMenuItemId,
            nameSnapshot,
            instructionsSnapshot,
            ...audit,
          });
        }
        await tx.kotItem.updateMany({
          where: { id: { in: item.kotItems.map(({ id }) => id) } },
          data: audit,
        });
        for (const id of correctionGroups.keys()) {
          const ticket = await tx.kot.update({
            where: { id },
            data: { controlVersion: { increment: 1 } },
            select: {
              status: true,
              controlVersion: true,
              acceptedAt: true,
              heldAt: true,
              holdReason: true,
              isPriority: true,
              targetSeconds: true,
            },
          });
          const { controlVersion: version, ...state } = ticket;
          await tx.preparationEvent.create({
            data: {
              ...state,
              version,
              restaurantId,
              kotId: id,
              recordedByUserId: userId,
              action: 'VOID',
              reason,
              createdAt: voidedAt,
            },
          });
        }
        const remaining = item.quantity - sent;
        await tx.orderItem.update({
          where: { id: itemId },
          data: remaining
            ? { quantity: remaining, sentQuantity: 0 }
            : { status: 'CANCELLED', sentQuantity: 0 },
        });
        const hasSentItems = await tx.orderItem.findFirst({
          where: { orderId, status: 'ACTIVE', kotItems: { some: { voidedAt: null } } },
          select: { id: true },
        });
        if (!hasSentItems) {
          await tx.order.update({ where: { id: orderId }, data: { status: 'OPEN' } });
        }
        const corrections = await createKotTickets(tx, {
          restaurantId,
          orderId,
          createdByUserId: userId,
          groups: [...correctionGroups.values()],
          select: kotSelect,
        });
        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: orderSelect,
        });
        return { order, corrections };
      },
      { timeout: 15_000 },
    );
  }

  findCurrent(restaurantId: string, tableId: string): Promise<OrderRecord | null> {
    return this.prisma.order.findFirst({
      where: { restaurantId, tableId, status: { in: ['OPEN', 'SUBMITTED'] } },
      select: orderSelect,
      orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Orders on the tables `captainUserId` is currently the assigned captain of. Open = OPEN/SUBMITTED;
   * closed = COMPLETED within the restaurant-local day. Both counts come from the same snapshot.
   */
  async findCaptainOrders(
    restaurantId: string,
    captainUserId: string,
    view: CaptainOrderView,
  ): Promise<CaptainOrdersResult | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const [context] = await tx.$queryRaw<{ currency: string; dayStart: Date; dayEnd: Date }[]>`
          SELECT
            r.currency,
            date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE r.timezone)
              AT TIME ZONE r.timezone AS "dayStart",
            (date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE r.timezone) + INTERVAL '1 day')
              AT TIME ZONE r.timezone AS "dayEnd"
          FROM restaurants r
          WHERE r.id = ${restaurantId}::uuid
        `;
        if (!context) return null;

        const mine = { restaurantId, table: { restaurantId, captainUserId } };
        const openWhere: Prisma.OrderWhereInput = {
          ...mine,
          status: { in: ['OPEN', 'SUBMITTED'] },
        };
        const closedWhere: Prisma.OrderWhereInput = {
          ...mine,
          status: 'COMPLETED',
          completedAt: { gte: context.dayStart, lt: context.dayEnd },
        };

        const [items, openCount, closedCount] = await Promise.all([
          tx.order.findMany({
            where: view === 'open' ? openWhere : closedWhere,
            select: captainOrderSelect,
            orderBy:
              view === 'open'
                ? [{ openedAt: 'asc' }, { id: 'asc' }]
                : [{ completedAt: 'desc' }, { id: 'desc' }],
          }),
          tx.order.count({ where: openWhere }),
          tx.order.count({ where: closedWhere }),
        ]);

        return { items, openCount, closedCount, currency: context.currency };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * Orders page, newest first. `from` / `to` are restaurant-local days on `openedAt`; Postgres
   * turns them into UTC bounds so DST and non-UTC zones resolve correctly ([from 00:00, to+1 00:00)).
   */
  async findOrderList(
    restaurantId: string,
    filters: OrderListFilters,
  ): Promise<OrderListResult | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const [context] = await tx.$queryRaw<
          { currency: string; timezone: string; fromStart: Date | null; toEnd: Date | null }[]
        >`
          SELECT
            r.currency,
            r.timezone,
            (${filters.from ?? null}::date)::timestamp AT TIME ZONE r.timezone AS "fromStart",
            (${filters.to ?? null}::date + 1)::timestamp AT TIME ZONE r.timezone AS "toEnd"
          FROM restaurants r
          WHERE r.id = ${restaurantId}::uuid
        `;
        if (!context) return null;

        const where: Prisma.OrderWhereInput = {
          restaurantId,
          ...(filters.status && { status: filters.status }),
          ...((context.fromStart || context.toEnd) && {
            openedAt: {
              ...(context.fromStart && { gte: context.fromStart }),
              ...(context.toEnd && { lt: context.toEnd }),
            },
          }),
          table: {
            restaurantId,
            ...(filters.captainUserId && { captainUserId: filters.captainUserId }),
            ...(filters.tableNumber && {
              tableNumber: { contains: filters.tableNumber, mode: 'insensitive' },
            }),
          },
        };

        const [items, total] = await Promise.all([
          tx.order.findMany({
            where,
            select: orderListSelect,
            orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
            skip: (filters.page - 1) * filters.pageSize,
            take: filters.pageSize,
          }),
          tx.order.count({ where }),
        ]);

        return { items, total, currency: context.currency, timezone: context.timezone };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  findActiveKotBoard(
    restaurantId: string,
    destination: KotDestination,
    statuses: readonly KotStatus[],
  ): Promise<KotQueueRecord[]> {
    return this.prisma.kot.findMany({
      where: { restaurantId, destination, status: { in: [...statuses] } },
      select: kotQueueSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async findKotQueue(
    restaurantId: string,
    query: KotQueueQuery,
  ): Promise<{ items: KotQueueRecord[]; total: number }> {
    const where: Prisma.KotWhereInput = {
      restaurantId,
      destination: query.destination,
      status: { in: [...query.status] },
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.kot.findMany({
          where,
          select: kotQueueSelect,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.kot.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total };
  }

  withLockedKot<T>(
    restaurantId: string,
    id: string,
    action: (context: LockedKotContext) => Promise<T>,
    recordedByUserId: string,
    completing = false,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        if (completing) await lockRestaurantInventory(tx, restaurantId);
        const candidate = await tx.kot.findFirst({
          where: { id, restaurantId },
          select: { orderId: true },
        });
        if (candidate) {
          // Share the existing order lock with firing/completion before locking the ticket.
          await tx.$queryRaw`SELECT id FROM orders WHERE id = ${candidate.orderId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM kots WHERE id = ${id}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
        }
        const ticket = await tx.kot.findFirst({
          where: { id, restaurantId },
          select: kotQueueSelect,
        });
        const recordEvent = async (
          action: string,
          current: KotQueueRecord,
          reason?: string,
        ): Promise<void> => {
          await tx.preparationEvent.create({
            data: {
              restaurantId,
              kotId: id,
              recordedByUserId,
              action,
              status: current.status,
              version: current.controlVersion,
              acceptedAt: current.acceptedAt,
              heldAt: current.heldAt,
              holdReason: current.holdReason,
              isPriority: current.isPriority,
              targetSeconds: current.targetSeconds,
              reason,
              // Capture time after the row locks; transaction-start timestamps can precede
              // an earlier version committed by another operator while this writer waited.
              createdAt: new Date(),
            },
          });
        };
        const baseline = async (): Promise<void> => {
          if (
            ticket &&
            !(await tx.preparationEvent.count({ where: { restaurantId, kotId: id } }))
          ) {
            await recordEvent('BASELINE', ticket);
          }
        };
        return action({
          kot: ticket,
          setPreparation: async (action, change, reason) => {
            await baseline();
            const updated = await tx.kot.update({
              where: { id, restaurantId },
              data: { ...change, controlVersion: { increment: 1 } },
              select: kotQueueSelect,
            });
            await recordEvent(action, updated, reason);
            return updated;
          },
          setStatus: async (status) => {
            await baseline();
            if (status === 'COMPLETED' && ticket?.status === 'READY') {
              await recordTicketStockUsage(
                tx,
                restaurantId,
                ticket.id,
                ticket.kotNumber,
                recordedByUserId,
              );
            }
            await tx.kot.update({
              where: { id, restaurantId },
              data: {
                status,
                completedAt: status === 'COMPLETED' ? new Date() : null,
                ...(status === 'PREPARING' && !ticket?.acceptedAt
                  ? { acceptedAt: new Date() }
                  : {}),
                controlVersion: { increment: 1 },
              },
            });
            await tx.kotItem.updateMany({
              where: { kotId: id, voidedAt: null, kot: { restaurantId } },
              data: { status },
            });
            // The guest hears "Your food is on its way" only when every ticket of the round is
            // Ready, so "Guest notified · h:mm pm" is stamped on all of them at that moment.
            const roundId = ticket?.qrRound ? ticket.qrRoundId : null;
            if (status === 'READY' && roundId) {
              const waiting = await tx.kot.count({
                where: {
                  restaurantId,
                  qrRoundId: roundId,
                  status: { in: ['PENDING', 'PREPARING'] },
                },
              });
              if (waiting === 0) {
                await tx.kot.updateMany({
                  where: { restaurantId, qrRoundId: roundId, guestNotifiedAt: null },
                  data: { guestNotifiedAt: new Date() },
                });
              }
            }
            const updated = await tx.kot.findFirstOrThrow({
              where: { id, restaurantId },
              select: kotQueueSelect,
            });
            await recordEvent('STATUS', updated);
            return updated;
          },
        });
      },
      completing ? { timeout: INVENTORY_LOCK_WAITER_TIMEOUT_MS } : undefined,
    );
  }

  async preparationHistory(restaurantId: string, kotId: string, query: PreparationHistoryQuery) {
    return this.prisma.$transaction(
      async (tx) => {
        const kot = await tx.kot.findFirst({
          where: { id: kotId, restaurantId },
          select: { id: true },
        });
        if (!kot) return null;
        const where = { restaurantId, kotId };
        const [items, total] = await Promise.all([
          tx.preparationEvent.findMany({
            where,
            orderBy: [{ version: 'desc' }, { id: 'desc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
            include: { recordedBy: { select: { id: true, name: true } } },
          }),
          tx.preparationEvent.count({ where }),
        ]);
        return { items, total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
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
        select: { id: true, isActive: true, currentStatus: { select: { code: true } } },
      });
      const reservation = await tx.reservation.findFirst({
        where: { id: reservationId, restaurantId },
        select: { id: true, tableId: true, status: true },
      });
      const existingOrder = await tx.order.findFirst({
        where: {
          restaurantId,
          OR: [{ tableId }, { reservationId }],
          status: { in: ['OPEN', 'SUBMITTED'] },
        },
        select: orderSelect,
        orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
      });

      return open({
        table,
        reservation,
        existingOrder,
        create: (details) =>
          tx.order.create({
            data: {
              restaurantId,
              tableId,
              ...details,
              seatedReservationOnOpen: reservation?.status === 'BOOKED',
            },
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

  findCompletedPaidOrder(restaurantId: string, orderId: string): Promise<OrderRecord | null> {
    return this.prisma.order.findFirst({
      where: {
        id: orderId,
        restaurantId,
        status: 'COMPLETED',
        bill: { status: 'PAID', payments: { some: { status: 'COMPLETED' } } },
      },
      select: orderSelect,
    });
  }
}
