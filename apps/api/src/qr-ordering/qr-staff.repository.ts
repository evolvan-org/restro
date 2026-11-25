import { Injectable } from '@nestjs/common';
import { Prisma } from '@rms/db';

import { roleAccessSelect } from '../common/auth/role-access';
import { createKotTickets, groupByDestination } from '../common/database/kot-tickets';
import { PrismaService } from '../common/database/prisma.service';
import { setTableLifecycleStatus } from '../common/database/table-lifecycle';

const roundCardSelect = {
  id: true,
  sessionId: true,
  roundNumber: true,
  status: true,
  subtotal: true,
  submittedAt: true,
  escalateAt: true,
  escalatedAt: true,
  onMyWayAt: true,
  approvedAt: true,
  rejectedAt: true,
  rejectReason: true,
  note: true,
  ownerCaptainUserId: true,
  owner: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  table: { select: { id: true, tableNumber: true, captainUserId: true } },
  session: { select: { status: true, _count: { select: { guests: true } } } },
  items: {
    select: {
      id: true,
      menuItemId: true,
      quantity: true,
      requestedQuantity: true,
      unitPrice: true,
      specialInstructions: true,
      status: true,
      menuItem: { select: { name: true, isVeg: true, itemType: true, isAvailable: true } },
      addedBy: { select: { displayName: true } },
    },
    orderBy: { id: 'asc' },
  },
  kots: { select: { status: true } },
} satisfies Prisma.QrRoundSelect;

export type QrRoundCardRecord = Prisma.QrRoundGetPayload<{ select: typeof roundCardSelect }>;

const billCardSelect = {
  id: true,
  billRequestedAt: true,
  table: {
    select: {
      id: true,
      tableNumber: true,
      captainUserId: true,
      captain: { select: { id: true, name: true } },
    },
  },
  shares: { select: { status: true } },
} satisfies Prisma.QrSessionSelect;

export type QrBillCardRecord = Prisma.QrSessionGetPayload<{ select: typeof billCardSelect }>;

const alertSelect = {
  id: true,
  kind: true,
  status: true,
  resolution: true,
  createdAt: true,
  resolvedAt: true,
  table: {
    select: { id: true, tableNumber: true, captain: { select: { id: true, name: true } } },
  },
  round: {
    select: {
      id: true,
      roundNumber: true,
      subtotal: true,
      submittedAt: true,
      owner: { select: { id: true, name: true } },
      items: { select: { quantity: true } },
      session: { select: { _count: { select: { guests: true } } } },
    },
  },
} satisfies Prisma.QrAlertSelect;

export type QrAlertRecord = Prisma.QrAlertGetPayload<{ select: typeof alertSelect }>;

const settingsSelect = {
  qrOrderingEnabled: true,
  qrEscalationMinutes: true,
  guestPhone: true,
  brandColor: true,
  upiQr: { select: { updatedAt: true } },
} satisfies Prisma.RestaurantSelect;

export type QrSettingsRecord = Prisma.RestaurantGetPayload<{ select: typeof settingsSelect }>;

type Tx = Prisma.TransactionClient;

export type ApproveEdits = Map<string, { quantity: number; outOfStock: boolean }>;

export type LockedRoundContext = {
  round: {
    id: string;
    status: 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED';
    sessionId: string;
    tableId: string;
    ownerCaptainUserId: string | null;
    roundNumber: number;
  } | null;
  tx: Tx;
};

@Injectable()
export class QrStaffRepository {
  constructor(private readonly prisma: PrismaService) {}

  findRestaurantQrState(restaurantId: string): Promise<{
    qrOrderingEnabled: boolean;
    qrEscalationMinutes: number;
    defaultGstRate: Prisma.Decimal;
  } | null> {
    return this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { qrOrderingEnabled: true, qrEscalationMinutes: true, defaultGstRate: true },
    });
  }

  /** Awaiting rounds, plus approved/rejected rounds of still-open sessions for the queue. */
  findQueueRounds(
    restaurantId: string,
    mineUserId: string | null,
    since: Date,
  ): Promise<QrRoundCardRecord[]> {
    const mine: Prisma.QrRoundWhereInput = mineUserId
      ? { OR: [{ ownerCaptainUserId: mineUserId }, { table: { captainUserId: mineUserId } }] }
      : {};
    return this.prisma.qrRound.findMany({
      where: {
        restaurantId,
        AND: [
          mine,
          {
            OR: [
              { status: 'AWAITING_APPROVAL' },
              { status: 'APPROVED', session: { status: 'OPEN' }, approvedAt: { gte: since } },
              { status: 'REJECTED', rejectedAt: { gte: since } },
            ],
          },
        ],
      },
      select: roundCardSelect,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    });
  }

  findBillRequests(restaurantId: string, mineUserId: string | null): Promise<QrBillCardRecord[]> {
    return this.prisma.qrSession.findMany({
      where: {
        restaurantId,
        status: 'OPEN',
        billRequestedAt: { not: null },
        ...(mineUserId && { table: { captainUserId: mineUserId } }),
      },
      select: billCardSelect,
      orderBy: [{ billRequestedAt: 'asc' }, { id: 'asc' }],
    });
  }

  countMyWaiting(
    restaurantId: string,
    userId: string,
  ): Promise<{ count: number; oldest: Date | null }> {
    return this.prisma.qrRound
      .aggregate({
        where: { restaurantId, status: 'AWAITING_APPROVAL', ownerCaptainUserId: userId },
        _count: { _all: true },
        _min: { submittedAt: true },
      })
      .then((result) => ({ count: result._count._all, oldest: result._min.submittedAt }));
  }

  /**
   * Closes alerts whose cause is gone, whatever path removed it (approve/reject from any screen,
   * a reassign, a captain set from the Tables screen, a settled bill): an escalation stays open only
   * while its round still waits escalated, a no-captain alert only while the table has no captain.
   * Idempotent; runs before alerts are listed or counted.
   */
  async resolveStaleAlerts(restaurantId: string, now: Date): Promise<number> {
    const escalations = await this.prisma.$executeRaw`
      UPDATE qr_alerts a
      SET status = 'RESOLVED', resolved_at = ${now}, updated_at = ${now},
          resolution = CASE
            WHEN r.status = 'APPROVED' THEN 'Approved'
            WHEN r.status = 'REJECTED' THEN 'Rejected'
            WHEN s.status = 'CLOSED' THEN 'Table closed'
            ELSE 'Reassigned'
          END
      FROM qr_rounds r
      JOIN qr_sessions s ON s.id = r.session_id
      WHERE a.round_id = r.id
        AND a.restaurant_id = ${restaurantId}::uuid
        AND a.kind = 'ESCALATION' AND a.status = 'OPEN'
        AND (r.status <> 'AWAITING_APPROVAL' OR r.escalated_at IS NULL OR s.status = 'CLOSED')
    `;
    const noCaptain = await this.prisma.$executeRaw`
      UPDATE qr_alerts a
      SET status = 'RESOLVED', resolved_at = ${now}, updated_at = ${now},
          resolution = 'Captain assigned'
      FROM restaurant_tables t
      WHERE a.table_id = t.id
        AND a.restaurant_id = ${restaurantId}::uuid
        AND a.kind = 'NO_CAPTAIN' AND a.status = 'OPEN'
        AND t.captain_user_id IS NOT NULL
    `;
    return escalations + noCaptain;
  }

  countOpenAlerts(restaurantId: string): Promise<number> {
    return this.prisma.qrAlert.count({ where: { restaurantId, status: 'OPEN' } });
  }

  findRound(restaurantId: string, roundId: string): Promise<QrRoundCardRecord | null> {
    return this.prisma.qrRound.findFirst({
      where: { id: roundId, restaurantId },
      select: roundCardSelect,
    });
  }

  findSessionGuests(sessionId: string): Promise<{ id: string; displayName: string }[]> {
    return this.prisma.qrGuest.findMany({
      where: { sessionId },
      select: { id: true, displayName: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Every round mutation locks the round row first, then works in the same transaction. */
  withLockedRound<T>(
    restaurantId: string,
    roundId: string,
    run: (context: LockedRoundContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          {
            id: string;
            status: 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED';
            sessionId: string;
            tableId: string;
            ownerCaptainUserId: string | null;
            roundNumber: number;
          }[]
        >`
          SELECT id, status, session_id AS "sessionId", table_id AS "tableId",
                 owner_captain_user_id AS "ownerCaptainUserId", round_number AS "roundNumber"
          FROM qr_rounds
          WHERE id = ${roundId}::uuid AND restaurant_id = ${restaurantId}::uuid
          FOR UPDATE
        `;
        return run({ round: rows[0] ?? null, tx });
      },
      { timeout: 20_000 },
    );
  }

  /**
   * Applies the captain's edits, writes the round's lines onto the table's staff order (opening one
   * if needed) and creates Kitchen/Bar KOTs tagged with the round and approver. Returns the KOT ids
   * and the edit log shown to the guest.
   */
  async approveRound(
    tx: Tx,
    input: {
      restaurantId: string;
      roundId: string;
      sessionId: string;
      tableId: string;
      approverUserId: string;
      edits: ApproveEdits;
      note: string | null;
      now: Date;
    },
  ): Promise<
    | { kind: 'approved'; kotIds: string[]; orderId: string }
    | { kind: 'empty' }
    | { kind: 'table-busy' }
  > {
    const { restaurantId, roundId, sessionId, tableId, approverUserId, edits, now } = input;
    const items = await tx.qrRoundItem.findMany({
      where: { roundId },
      select: {
        id: true,
        quantity: true,
        requestedQuantity: true,
        unitPrice: true,
        specialInstructions: true,
        menuItemId: true,
        menuItem: { select: { name: true, itemType: true } },
      },
      orderBy: { id: 'asc' },
    });

    const editLog: { name: string; from: number; to: number; outOfStock: boolean }[] = [];
    const finalLines: typeof items = [];
    for (const item of items) {
      const edit = edits.get(item.id);
      const quantity = edit ? (edit.outOfStock ? 0 : edit.quantity) : item.quantity;
      const status = edit?.outOfStock ? 'OUT_OF_STOCK' : quantity === 0 ? 'REMOVED' : 'ACTIVE';
      if (quantity !== item.requestedQuantity || status !== 'ACTIVE') {
        editLog.push({
          name: item.menuItem.name,
          from: item.requestedQuantity,
          to: quantity,
          outOfStock: status === 'OUT_OF_STOCK',
        });
      }
      if (edit) {
        await tx.qrRoundItem.update({ where: { id: item.id }, data: { quantity, status } });
      }
      if (status === 'ACTIVE') finalLines.push({ ...item, quantity });
    }
    if (finalLines.length === 0) return { kind: 'empty' };

    // Same lock order as staff order opening: the table, then its order.
    await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
    const session = await tx.qrSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { orderId: true },
    });
    let order = session.orderId
      ? await tx.order.findFirst({
          where: { id: session.orderId, restaurantId, status: { in: ['OPEN', 'SUBMITTED'] } },
          select: { id: true },
        })
      : null;
    if (!order) {
      // Staff may already have an order open on the table; join it so there is one bill.
      order = await tx.order.findFirst({
        where: { restaurantId, tableId, status: { in: ['OPEN', 'SUBMITTED'] } },
        select: { id: true },
        orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
      });
    }
    if (order) {
      const bill = await tx.bill.findUnique({
        where: { orderId: order.id },
        select: { status: true },
      });
      if (bill?.status === 'PAID') return { kind: 'table-busy' };
    } else {
      order = await tx.order.create({
        data: {
          restaurantId,
          tableId,
          reservationId: null,
          createdByUserId: approverUserId,
          status: 'OPEN',
          openedAt: now,
        },
        select: { id: true },
      });
      await setTableLifecycleStatus(tx, restaurantId, tableId, 'OCCUPIED');
    }
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
    await tx.qrSession.update({ where: { id: sessionId }, data: { orderId: order.id } });

    const kotLines: { orderItemId: string; quantity: number; itemType: 'FOOD' | 'BAR' }[] = [];
    for (const line of finalLines) {
      const orderItem = await tx.orderItem.create({
        data: {
          orderId: order.id,
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          specialInstructions: line.specialInstructions,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      await tx.qrRoundItem.update({ where: { id: line.id }, data: { orderItemId: orderItem.id } });
      kotLines.push({
        orderItemId: orderItem.id,
        quantity: line.quantity,
        itemType: line.menuItem.itemType,
      });
    }
    const kots = await createKotTickets(tx, {
      restaurantId,
      orderId: order.id,
      createdByUserId: approverUserId,
      groups: groupByDestination(kotLines),
      select: { id: true },
      qr: { roundId, approvedByUserId: approverUserId },
    });
    await tx.order.update({ where: { id: order.id, restaurantId }, data: { status: 'SUBMITTED' } });

    const subtotal = finalLines.reduce(
      (sum, line) => sum.plus(line.unitPrice.mul(line.quantity)),
      new Prisma.Decimal(0),
    );
    await tx.qrRound.update({
      where: { id: roundId },
      data: {
        status: 'APPROVED',
        approvedAt: now,
        approvedByUserId: approverUserId,
        subtotal,
        editLog: editLog.length ? editLog : Prisma.JsonNull,
        editNote: editLog.length ? input.note : null,
      },
    });
    await this.resolveRoundAlerts(tx, roundId, approverUserId, 'Approved', now);
    return { kind: 'approved', kotIds: kots.map((kot) => kot.id), orderId: order.id };
  }

  async rejectRound(
    tx: Tx,
    roundId: string,
    userId: string,
    reason: string,
    now: Date,
  ): Promise<void> {
    await tx.qrRound.update({
      where: { id: roundId },
      data: { status: 'REJECTED', rejectedAt: now, rejectedByUserId: userId, rejectReason: reason },
    });
    await this.resolveRoundAlerts(tx, roundId, userId, 'Rejected', now);
  }

  async markOnMyWay(tx: Tx, roundId: string, now: Date): Promise<void> {
    await tx.qrRound.update({ where: { id: roundId }, data: { onMyWayAt: now } });
  }

  private async resolveRoundAlerts(
    tx: Tx,
    roundId: string,
    userId: string,
    resolution: string,
    now: Date,
  ): Promise<void> {
    await tx.qrAlert.updateMany({
      where: { roundId, status: 'OPEN' },
      data: { status: 'RESOLVED', resolvedByUserId: userId, resolution, resolvedAt: now },
    });
  }

  /**
   * Atomically claims every round past its deadline (or flagged for immediate escalation) and
   * opens one escalation alert each. Safe across API instances: a round is claimed exactly once.
   */
  escalateDueRounds(
    now: Date,
    restaurantId?: string,
  ): Promise<{ id: string; restaurantId: string; sessionId: string }[]> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = restaurantId
        ? await tx.$queryRaw<
            { id: string; restaurantId: string; sessionId: string; tableId: string }[]
          >`
            UPDATE qr_rounds SET escalated_at = ${now}, updated_at = ${now}
            WHERE status = 'AWAITING_APPROVAL' AND escalated_at IS NULL AND on_my_way_at IS NULL
              AND escalate_at <= ${now} AND restaurant_id = ${restaurantId}::uuid
            RETURNING id, restaurant_id AS "restaurantId", session_id AS "sessionId", table_id AS "tableId"
          `
        : await tx.$queryRaw<
            { id: string; restaurantId: string; sessionId: string; tableId: string }[]
          >`
            UPDATE qr_rounds SET escalated_at = ${now}, updated_at = ${now}
            WHERE status = 'AWAITING_APPROVAL' AND escalated_at IS NULL AND on_my_way_at IS NULL
              AND escalate_at <= ${now}
            RETURNING id, restaurant_id AS "restaurantId", session_id AS "sessionId", table_id AS "tableId"
          `;
      if (claimed.length) {
        await tx.qrAlert.createMany({
          data: claimed.map((round) => ({
            restaurantId: round.restaurantId,
            tableId: round.tableId,
            roundId: round.id,
            kind: 'ESCALATION' as const,
            status: 'OPEN' as const,
          })),
          skipDuplicates: true,
        });
      }
      return claimed.map(({ id, restaurantId: rid, sessionId }) => ({
        id,
        restaurantId: rid,
        sessionId,
      }));
    });
  }

  findEscalatedRoundSummary(roundId: string): Promise<{
    roundNumber: number;
    subtotal: Prisma.Decimal;
    submittedAt: Date;
    table: { id: string; tableNumber: string };
    owner: { name: string } | null;
    items: { quantity: number }[];
    session: { _count: { guests: number } };
    restaurant: { qrEscalationMinutes: number; defaultGstRate: Prisma.Decimal };
  } | null> {
    return this.prisma.qrRound.findUnique({
      where: { id: roundId },
      select: {
        roundNumber: true,
        subtotal: true,
        submittedAt: true,
        table: { select: { id: true, tableNumber: true } },
        owner: { select: { name: true } },
        items: { where: { status: 'ACTIVE' }, select: { quantity: true } },
        session: { select: { _count: { select: { guests: true } } } },
        restaurant: { select: { qrEscalationMinutes: true, defaultGstRate: true } },
      },
    });
  }

  /** Captains (eligibility from real role rows) with their current load. */
  async findCaptainCandidates(restaurantId: string): Promise<
    {
      id: string;
      name: string;
      status: string;
      lastSeenAt: Date | null;
      role: { name: string; isOwner: boolean; permissions: { permissionKey: string }[] };
      activeTables: number;
      pendingOrders: number;
    }[]
  > {
    const users = await this.prisma.user.findMany({
      where: {
        restaurantId,
        status: 'ACTIVE',
        role: { permissions: { some: { permissionKey: 'table:be-captain' } } },
      },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        role: { select: roleAccessSelect },
        _count: {
          select: {
            tablesCaptained: { where: { isActive: true } },
            qrRoundsOwned: { where: { status: 'AWAITING_APPROVAL' } },
          },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return users.map(({ _count, ...user }) => ({
      ...user,
      activeTables: _count.tablesCaptained,
      pendingOrders: _count.qrRoundsOwned,
    }));
  }

  findCaptainCandidate(
    restaurantId: string,
    userId: string,
  ): Promise<{
    id: string;
    name: string;
    status: string;
    role: { name: string; isOwner: boolean; permissions: { permissionKey: string }[] };
  } | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, restaurantId },
      select: { id: true, name: true, status: true, role: { select: roleAccessSelect } },
    });
  }

  /**
   * Sets the table's captain, optionally moves waiting rounds to them (restarting the timer), and
   * resolves the table's open no-captain and escalation alerts.
   */
  assignCaptain(input: {
    restaurantId: string;
    tableId: string;
    captainUserId: string;
    moveWaiting: boolean;
    actorUserId: string;
    escalationMinutes: number;
    captainName: string;
    now: Date;
  }): Promise<{
    previousCaptainId: string | null;
    moved: { id: string; sessionId: string }[];
  } | null> {
    const { restaurantId, tableId, now } = input;
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ captainUserId: string | null }[]>`
        SELECT captain_user_id AS "captainUserId" FROM restaurant_tables
        WHERE id = ${tableId}::uuid AND restaurant_id = ${restaurantId}::uuid
        FOR UPDATE
      `;
      const table = rows[0];
      if (!table) return null;
      await tx.restaurantTable.update({
        where: { id: tableId, restaurantId },
        data: { captainUserId: input.captainUserId },
      });
      let moved: { id: string; sessionId: string }[] = [];
      if (input.moveWaiting) {
        const waiting = await tx.qrRound.findMany({
          where: {
            restaurantId,
            tableId,
            status: 'AWAITING_APPROVAL',
            ownerCaptainUserId: { not: input.captainUserId },
          },
          select: { id: true, sessionId: true, ownerCaptainUserId: true },
        });
        for (const round of waiting) {
          await tx.qrRound.update({
            where: { id: round.id },
            data: {
              ownerCaptainUserId: input.captainUserId,
              reassignedFromUserId: round.ownerCaptainUserId,
              reassignedAt: now,
              escalateAt: new Date(now.getTime() + input.escalationMinutes * 60_000),
              escalatedAt: null,
              onMyWayAt: null,
            },
          });
        }
        moved = waiting.map(({ id, sessionId }) => ({ id, sessionId }));
        await tx.qrAlert.updateMany({
          where: { restaurantId, tableId, kind: 'ESCALATION', status: 'OPEN' },
          data: {
            status: 'RESOLVED',
            resolvedByUserId: input.actorUserId,
            resolution: `Reassigned to ${input.captainName}`,
            resolvedAt: now,
          },
        });
      }
      await tx.qrAlert.updateMany({
        where: { restaurantId, tableId, kind: 'NO_CAPTAIN', status: 'OPEN' },
        data: {
          status: 'RESOLVED',
          resolvedByUserId: input.actorUserId,
          resolution: `${input.captainName} assigned`,
          resolvedAt: now,
        },
      });
      return { previousCaptainId: table.captainUserId, moved };
    });
  }

  findTableCaptain(
    restaurantId: string,
    tableId: string,
  ): Promise<{ captainUserId: string | null } | null> {
    return this.prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
      select: { captainUserId: true },
    });
  }

  findOpenSessionIdsForTable(restaurantId: string, tableId: string): Promise<{ id: string }[]> {
    return this.prisma.qrSession.findMany({
      where: { restaurantId, tableId, status: 'OPEN' },
      select: { id: true },
    });
  }

  findAlerts(restaurantId: string, since: Date): Promise<QrAlertRecord[]> {
    return this.prisma.qrAlert.findMany({
      where: { restaurantId, OR: [{ status: 'OPEN' }, { resolvedAt: { gte: since } }] },
      select: alertSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
  }

  async dismissAlert(restaurantId: string, alertId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.qrAlert.updateMany({
      where: { id: alertId, restaurantId, status: 'OPEN' },
      data: {
        status: 'DISMISSED',
        resolvedByUserId: userId,
        resolution: 'Dismissed',
        resolvedAt: new Date(),
      },
    });
    return result.count > 0;
  }

  async floor(restaurantId: string): Promise<{
    tables: { id: string; captainUserId: string | null }[];
    waiting: { tableId: string; submittedAt: Date; escalatedAt: Date | null }[];
    billRequested: { tableId: string }[];
  }> {
    const [tables, waiting, billRequested] = await this.prisma.$transaction([
      this.prisma.restaurantTable.findMany({
        where: { restaurantId, isActive: true },
        select: { id: true, captainUserId: true },
      }),
      this.prisma.qrRound.findMany({
        where: { restaurantId, status: 'AWAITING_APPROVAL' },
        select: { tableId: true, submittedAt: true, escalatedAt: true },
        orderBy: { submittedAt: 'asc' },
      }),
      this.prisma.qrSession.findMany({
        where: { restaurantId, status: 'OPEN', billRequestedAt: { not: null } },
        select: { tableId: true },
      }),
    ]);
    return { tables, waiting, billRequested };
  }

  findSettings(restaurantId: string): Promise<QrSettingsRecord | null> {
    return this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: settingsSelect,
    });
  }

  updateSettings(
    restaurantId: string,
    data: {
      qrOrderingEnabled: boolean;
      qrEscalationMinutes: number;
      guestPhone: string | null;
      brandColor: string | null;
    },
  ): Promise<QrSettingsRecord> {
    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data,
      select: settingsSelect,
    });
  }

  async saveUpiQr(
    restaurantId: string,
    mimeType: string,
    data: Uint8Array<ArrayBuffer>,
  ): Promise<void> {
    await this.prisma.restaurantUpiQr.upsert({
      where: { restaurantId },
      create: { restaurantId, mimeType, data },
      update: { mimeType, data },
    });
  }

  async deleteUpiQr(restaurantId: string): Promise<void> {
    await this.prisma.restaurantUpiQr.deleteMany({ where: { restaurantId } });
  }

  findUpiQr(
    restaurantId: string,
  ): Promise<{ mimeType: string; data: Uint8Array; updatedAt: Date } | null> {
    return this.prisma.restaurantUpiQr.findUnique({
      where: { restaurantId },
      select: { mimeType: true, data: true, updatedAt: true },
    });
  }

  hasUpiQr(restaurantId: string): Promise<boolean> {
    return this.prisma.restaurantUpiQr
      .count({ where: { restaurantId } })
      .then((count) => count > 0);
  }

  findCards(restaurantId: string): Promise<{
    restaurant: {
      name: string;
      currency: string;
      brandColor: string | null;
      guestPhone: string | null;
    } | null;
    tables: {
      id: string;
      tableNumber: string;
      isActive: boolean;
      qrToken: string;
      section: { name: string; sortOrder: number };
    }[];
  }> {
    return this.prisma.$transaction(async (tx) => ({
      restaurant: await tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true, currency: true, brandColor: true, guestPhone: true },
      }),
      tables: await tx.restaurantTable.findMany({
        where: { restaurantId },
        select: {
          id: true,
          tableNumber: true,
          isActive: true,
          qrToken: true,
          section: { select: { name: true, sortOrder: true } },
        },
      }),
    }));
  }

  async rotateToken(restaurantId: string, tableId: string, token: string): Promise<boolean> {
    const result = await this.prisma.restaurantTable.updateMany({
      where: { id: tableId, restaurantId },
      data: { qrToken: token },
    });
    return result.count > 0;
  }

  /** Locks the session and returns what share payments need. */
  withLockedSession<T>(
    restaurantId: string,
    sessionId: string,
    run: (tx: Tx, found: boolean) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM qr_sessions
        WHERE id = ${sessionId}::uuid AND restaurant_id = ${restaurantId}::uuid
        FOR UPDATE
      `;
      return run(tx, rows.length > 0);
    });
  }

  findShare(
    restaurantId: string,
    shareId: string,
  ): Promise<{ id: string; sessionId: string; status: string; label: string } | null> {
    return this.prisma.qrBillShare.findFirst({
      where: { id: shareId, restaurantId },
      select: { id: true, sessionId: true, status: true, label: true },
    });
  }

  async markSharePaid(
    tx: Tx,
    shareId: string,
    data: {
      method: 'CASH' | 'CARD' | 'UPI';
      amount: Prisma.Decimal;
      referenceNumber: string | null;
      userId: string;
      now: Date;
    },
  ): Promise<number> {
    const result = await tx.qrBillShare.updateMany({
      where: { id: shareId, status: { not: 'PAID' } },
      data: {
        status: 'PAID',
        paymentMethod: data.method,
        paidAmount: data.amount,
        referenceNumber: data.referenceNumber,
        recordedByUserId: data.userId,
        paidAt: data.now,
      },
    });
    return result.count;
  }

  async createPaidShare(
    tx: Tx,
    data: {
      restaurantId: string;
      sessionId: string;
      label: string;
      method: 'CASH' | 'CARD' | 'UPI';
      amount: Prisma.Decimal;
      referenceNumber: string | null;
      userId: string;
      now: Date;
    },
  ): Promise<void> {
    await tx.qrBillShare.create({
      data: {
        restaurantId: data.restaurantId,
        sessionId: data.sessionId,
        label: data.label,
        amount: data.amount,
        status: 'PAID',
        paymentMethod: data.method,
        paidAmount: data.amount,
        referenceNumber: data.referenceNumber,
        recordedByUserId: data.userId,
        paidAt: data.now,
      },
    });
  }

  findPaidShares(
    sessionId: string,
  ): Promise<
    { paymentMethod: 'CASH' | 'CARD' | 'UPI' | null; paidAmount: Prisma.Decimal | null }[]
  > {
    return this.prisma.qrBillShare.findMany({
      where: { sessionId, status: 'PAID' },
      select: { paymentMethod: true, paidAmount: true },
    });
  }

  async closeSession(restaurantId: string, sessionId: string, now: Date): Promise<void> {
    await this.prisma.qrSession.updateMany({
      where: { id: sessionId, restaurantId, status: 'OPEN' },
      data: { status: 'CLOSED', closedAt: now },
    });
  }

  findSessionTable(
    restaurantId: string,
    sessionId: string,
  ): Promise<{
    id: string;
    status: string;
    table: { id: string; tableNumber: string; captainUserId: string | null };
  } | null> {
    return this.prisma.qrSession.findFirst({
      where: { id: sessionId, restaurantId },
      select: {
        id: true,
        status: true,
        table: { select: { id: true, tableNumber: true, captainUserId: true } },
      },
    });
  }
}
