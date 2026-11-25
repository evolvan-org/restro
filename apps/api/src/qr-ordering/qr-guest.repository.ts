import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { PrismaService } from '../common/database/prisma.service';

const tableContextSelect = {
  id: true,
  restaurantId: true,
  tableNumber: true,
  isActive: true,
  captainUserId: true,
  currentStatus: { select: { code: true } },
  captain: { select: { id: true, name: true, status: true, lastSeenAt: true } },
  restaurant: {
    select: {
      id: true,
      name: true,
      status: true,
      currency: true,
      defaultGstRate: true,
      qrOrderingEnabled: true,
      qrEscalationMinutes: true,
      guestPhone: true,
      brandColor: true,
    },
  },
} satisfies Prisma.RestaurantTableSelect;

export type QrTableContext = Prisma.RestaurantTableGetPayload<{
  select: typeof tableContextSelect;
}>;

const menuSelect = {
  id: true,
  name: true,
  items: {
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      isVeg: true,
      isAvailable: true,
      itemType: true,
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.MenuCategorySelect;

export type QrMenuRecord = Prisma.MenuCategoryGetPayload<{ select: typeof menuSelect }>[];

const sessionViewSelect = {
  id: true,
  restaurantId: true,
  tableId: true,
  orderId: true,
  status: true,
  billRequestedAt: true,
  splitMode: true,
  closedAt: true,
  guests: {
    select: { id: true, displayName: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  cartItems: {
    select: {
      id: true,
      menuItemId: true,
      quantity: true,
      specialInstructions: true,
      addedByGuestId: true,
      menuItem: {
        select: { name: true, price: true, isVeg: true, isAvailable: true, isActive: true },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  rounds: {
    select: {
      id: true,
      roundNumber: true,
      status: true,
      submittedAt: true,
      escalatedAt: true,
      onMyWayAt: true,
      approvedAt: true,
      rejectedAt: true,
      rejectReason: true,
      editLog: true,
      editNote: true,
      reassignedAt: true,
      owner: { select: { name: true } },
      approvedBy: { select: { name: true } },
      rejectedBy: { select: { name: true } },
      reassignedFromUserId: true,
      items: {
        select: {
          id: true,
          quantity: true,
          requestedQuantity: true,
          unitPrice: true,
          specialInstructions: true,
          status: true,
          menuItem: { select: { name: true, isVeg: true } },
          addedBy: { select: { displayName: true } },
        },
        orderBy: { id: 'asc' },
      },
      kots: { select: { status: true, guestNotifiedAt: true, completedAt: true, updatedAt: true } },
    },
    orderBy: { roundNumber: 'asc' },
  },
  order: {
    select: {
      id: true,
      status: true,
      items: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          menuItem: { select: { name: true } },
          qrRoundItems: { select: { addedBy: { select: { displayName: true } } }, take: 1 },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
      bill: {
        select: {
          id: true,
          status: true,
          subtotal: true,
          discountAmount: true,
          gstRate: true,
          gstAmount: true,
          totalAmount: true,
        },
      },
    },
  },
  shares: {
    select: {
      id: true,
      guestId: true,
      label: true,
      amount: true,
      claimedItems: true,
      status: true,
      requestedMethod: true,
      paymentMethod: true,
      paidAmount: true,
      paidAt: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.QrSessionSelect;

export type QrSessionView = Prisma.QrSessionGetPayload<{ select: typeof sessionViewSelect }>;

export type GuestIdentity = {
  guestId: string;
  sessionId: string;
  restaurantId: string;
  tableId: string;
  displayName: string;
  sessionStatus: 'OPEN' | 'CLOSED';
  closedAt: Date | null;
};

type Tx = Prisma.TransactionClient;

@Injectable()
export class QrGuestRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTableByToken(token: string): Promise<QrTableContext | null> {
    return this.prisma.restaurantTable.findUnique({
      where: { qrToken: token },
      select: tableContextSelect,
    });
  }

  findMenu(restaurantId: string): Promise<QrMenuRecord> {
    return this.prisma.menuCategory.findMany({
      where: { restaurantId, isActive: true, items: { some: { isActive: true } } },
      select: menuSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  /** De-duplicated: the partial unique index keeps one OPEN no-captain alert per table. */
  async openNoCaptainAlert(restaurantId: string, tableId: string): Promise<boolean> {
    const result = await this.prisma.qrAlert.createMany({
      data: [{ restaurantId, tableId, kind: 'NO_CAPTAIN', status: 'OPEN' }],
      skipDuplicates: true,
    });
    return result.count > 0;
  }

  /**
   * Joins the table's OPEN session (creating it if needed) as a new phone. The guest's phone is
   * upserted into `guests` (unique per restaurant). Locks the table so two first scans can't open
   * two sessions; the partial unique index is the backstop.
   */
  join(input: {
    restaurantId: string;
    tableId: string;
    name: string;
    phone: string;
    secretHash: string;
  }): Promise<{ guestId: string; sessionId: string }> {
    const { restaurantId, tableId } = input;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      const session =
        (await tx.qrSession.findFirst({
          where: { restaurantId, tableId, status: 'OPEN' },
          select: { id: true },
        })) ??
        (await tx.qrSession.create({
          data: { restaurantId, tableId, status: 'OPEN' },
          select: { id: true },
        }));
      const guest = await tx.guest.upsert({
        where: { restaurantId_phoneNumber: { restaurantId, phoneNumber: input.phone } },
        create: { restaurantId, phoneNumber: input.phone, guestName: input.name },
        update: { guestName: input.name },
        select: { id: true },
      });
      const qrGuest = await tx.qrGuest.create({
        data: {
          restaurantId,
          sessionId: session.id,
          guestId: guest.id,
          displayName: input.name,
          secretHash: input.secretHash,
        },
        select: { id: true },
      });
      return { guestId: qrGuest.id, sessionId: session.id };
    });
  }

  async findGuestBySecret(secretHash: string): Promise<GuestIdentity | null> {
    const guest = await this.prisma.qrGuest.findUnique({
      where: { secretHash },
      select: {
        id: true,
        displayName: true,
        restaurantId: true,
        session: { select: { id: true, tableId: true, status: true, closedAt: true } },
      },
    });
    if (!guest) return null;
    return {
      guestId: guest.id,
      sessionId: guest.session.id,
      restaurantId: guest.restaurantId,
      tableId: guest.session.tableId,
      displayName: guest.displayName,
      sessionStatus: guest.session.status,
      closedAt: guest.session.closedAt,
    };
  }

  async touchGuest(guestId: string): Promise<void> {
    await this.prisma.qrGuest.updateMany({
      where: { id: guestId, lastSeenAt: { lt: new Date(Date.now() - 60_000) } },
      data: { lastSeenAt: new Date() },
    });
  }

  findSessionView(restaurantId: string, sessionId: string): Promise<QrSessionView | null> {
    return this.prisma.qrSession.findFirst({
      where: { id: sessionId, restaurantId },
      select: sessionViewSelect,
    });
  }

  findAvailableMenuItem(
    restaurantId: string,
    menuItemId: string,
  ): Promise<{ id: string; isAvailable: boolean } | null> {
    return this.prisma.menuItem.findFirst({
      where: { id: menuItemId, restaurantId, isActive: true, category: { isActive: true } },
      select: { id: true, isAvailable: true },
    });
  }

  /** Cart writes lock the session row so concurrent phones serialize. */
  withLockedSession<T>(
    restaurantId: string,
    sessionId: string,
    run: (tx: Tx, session: { id: string; status: 'OPEN' | 'CLOSED' } | null) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; status: 'OPEN' | 'CLOSED' }[]>`
          SELECT id, status FROM qr_sessions
          WHERE id = ${sessionId}::uuid AND restaurant_id = ${restaurantId}::uuid
          FOR UPDATE
        `;
        return run(tx, rows[0] ?? null);
      },
      { timeout: 15_000 },
    );
  }

  cartLineCount(tx: Tx, sessionId: string): Promise<number> {
    return tx.qrCartItem.count({ where: { sessionId } });
  }

  findMergeableCartLine(
    tx: Tx,
    sessionId: string,
    match: { menuItemId: string; specialInstructions: string | null; guestId: string },
  ): Promise<{ id: string; quantity: number } | null> {
    return tx.qrCartItem.findFirst({
      where: {
        sessionId,
        menuItemId: match.menuItemId,
        specialInstructions: match.specialInstructions,
        addedByGuestId: match.guestId,
      },
      select: { id: true, quantity: true },
    });
  }

  async addCartLine(
    tx: Tx,
    data: {
      sessionId: string;
      menuItemId: string;
      quantity: number;
      specialInstructions: string | null;
      guestId: string;
    },
  ): Promise<void> {
    await tx.qrCartItem.create({
      data: {
        sessionId: data.sessionId,
        menuItemId: data.menuItemId,
        quantity: data.quantity,
        specialInstructions: data.specialInstructions,
        addedByGuestId: data.guestId,
      },
    });
  }

  async setCartLineQuantity(
    tx: Tx,
    sessionId: string,
    lineId: string,
    quantity: number,
  ): Promise<number> {
    if (quantity === 0) {
      return (await tx.qrCartItem.deleteMany({ where: { id: lineId, sessionId } })).count;
    }
    return (
      await tx.qrCartItem.updateMany({ where: { id: lineId, sessionId }, data: { quantity } })
    ).count;
  }

  findRoundByIdempotencyKey(
    tx: Tx,
    sessionId: string,
    idempotencyKey: string,
  ): Promise<{ id: string } | null> {
    return tx.qrRound.findUnique({
      where: { sessionId_idempotencyKey: { sessionId, idempotencyKey } },
      select: { id: true },
    });
  }

  findCartForSubmit(
    tx: Tx,
    restaurantId: string,
    sessionId: string,
  ): Promise<
    {
      id: string;
      menuItemId: string;
      quantity: number;
      specialInstructions: string | null;
      addedByGuestId: string;
      menuItem: {
        price: Prisma.Decimal;
        isAvailable: boolean;
        isActive: boolean;
        name: string;
        restaurantId: string;
      };
    }[]
  > {
    return tx.qrCartItem.findMany({
      where: { sessionId, session: { restaurantId } },
      select: {
        id: true,
        menuItemId: true,
        quantity: true,
        specialInstructions: true,
        addedByGuestId: true,
        menuItem: {
          select: {
            price: true,
            isAvailable: true,
            isActive: true,
            name: true,
            restaurantId: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async createRound(
    tx: Tx,
    data: {
      restaurantId: string;
      sessionId: string;
      tableId: string;
      ownerCaptainUserId: string;
      guestId: string;
      idempotencyKey: string;
      note: string | null;
      subtotal: Prisma.Decimal;
      submittedAt: Date;
      escalateAt: Date;
      items: {
        menuItemId: string;
        addedByGuestId: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        specialInstructions: string | null;
      }[];
    },
  ): Promise<{ id: string; roundNumber: number }> {
    const last = await tx.qrRound.findFirst({
      where: { sessionId: data.sessionId },
      select: { roundNumber: true },
      orderBy: { roundNumber: 'desc' },
    });
    const round = await tx.qrRound.create({
      data: {
        restaurantId: data.restaurantId,
        sessionId: data.sessionId,
        tableId: data.tableId,
        roundNumber: (last?.roundNumber ?? 0) + 1,
        status: 'AWAITING_APPROVAL',
        ownerCaptainUserId: data.ownerCaptainUserId,
        submittedByGuestId: data.guestId,
        idempotencyKey: data.idempotencyKey,
        note: data.note,
        subtotal: data.subtotal,
        submittedAt: data.submittedAt,
        escalateAt: data.escalateAt,
        items: {
          create: data.items.map((item) => ({
            menuItemId: item.menuItemId,
            addedByGuestId: item.addedByGuestId,
            requestedQuantity: item.quantity,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            specialInstructions: item.specialInstructions,
          })),
        },
      },
      select: { id: true, roundNumber: true },
    });
    await tx.qrCartItem.deleteMany({ where: { sessionId: data.sessionId } });
    return round;
  }

  findRejectedRoundItems(
    tx: Tx,
    restaurantId: string,
    sessionId: string,
    roundId: string,
  ): Promise<{
    status: string;
    items: {
      menuItemId: string;
      requestedQuantity: number;
      specialInstructions: string | null;
      addedByGuestId: string;
    }[];
  } | null> {
    return tx.qrRound.findFirst({
      where: { id: roundId, sessionId, restaurantId },
      select: {
        status: true,
        items: {
          select: {
            menuItemId: true,
            requestedQuantity: true,
            specialInstructions: true,
            addedByGuestId: true,
          },
        },
      },
    });
  }

  async findUserNames(restaurantId: string, ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { restaurantId, id: { in: [...ids] } },
      select: { id: true, name: true },
    });
    return new Map(users.map((user) => [user.id, user.name]));
  }

  async markBillRequested(restaurantId: string, sessionId: string): Promise<boolean> {
    const result = await this.prisma.qrSession.updateMany({
      where: { id: sessionId, restaurantId, status: 'OPEN', billRequestedAt: null },
      data: { billRequestedAt: new Date() },
    });
    return result.count > 0;
  }

  async replaceUnpaidShares(
    tx: Tx,
    restaurantId: string,
    sessionId: string,
    mode: 'FULL' | 'EQUAL',
    shares: { label: string; amount: Prisma.Decimal; guestId: string | null }[],
  ): Promise<void> {
    await tx.qrBillShare.deleteMany({
      where: { sessionId, restaurantId, status: { not: 'PAID' } },
    });
    await tx.qrSession.update({ where: { id: sessionId }, data: { splitMode: mode } });
    if (shares.length) {
      await tx.qrBillShare.createMany({
        data: shares.map((share) => ({ ...share, restaurantId, sessionId })),
      });
    }
  }

  async replaceMyShare(
    tx: Tx,
    restaurantId: string,
    sessionId: string,
    guestId: string,
    mode: 'BY_ITEM' | 'CUSTOM',
    share: {
      label: string;
      amount: Prisma.Decimal;
      claimedItems: { orderItemId: string; quantity: number }[] | null;
    },
  ): Promise<void> {
    // Switching from an equal/full split to personal shares drops the unclaimed placeholders.
    await tx.qrBillShare.deleteMany({
      where: {
        sessionId,
        restaurantId,
        status: { not: 'PAID' },
        OR: [{ guestId }, { guestId: null }],
      },
    });
    await tx.qrSession.update({ where: { id: sessionId }, data: { splitMode: mode } });
    await tx.qrBillShare.create({
      data: {
        restaurantId,
        sessionId,
        guestId,
        label: share.label,
        amount: share.amount,
        claimedItems: share.claimedItems ?? Prisma.JsonNull,
      },
    });
  }

  findShareForGuest(
    tx: Tx,
    restaurantId: string,
    sessionId: string,
    shareId: string,
  ): Promise<{
    id: string;
    status: string;
    guestId: string | null;
    amount: Prisma.Decimal;
  } | null> {
    return tx.qrBillShare.findFirst({
      where: { id: shareId, sessionId, restaurantId },
      select: { id: true, status: true, guestId: true, amount: true },
    });
  }

  async requestSharePayment(
    tx: Tx,
    shareId: string,
    guestId: string,
    method: 'CASH' | 'CARD' | 'UPI',
    label: string | null,
  ): Promise<void> {
    await tx.qrBillShare.update({
      where: { id: shareId },
      data: {
        status: 'PAYMENT_REQUESTED',
        requestedMethod: method,
        guestId,
        ...(label && { label }),
      },
    });
  }
}
