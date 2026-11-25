import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  QrAlert,
  QrAlertsResponse,
  QrApproveRoundRequest,
  QrAssignCaptainRequest,
  QrAssignCaptainResponse,
  QrCaptainOptionsResponse,
  QrChannelAuthRequest,
  QrChannelAuthResponse,
  QrCollectAtTableRequest,
  QrFloorResponse,
  QrQueueQuery,
  QrQueueResponse,
  QrRealtimeConfig,
  QrRecordSharePaymentRequest,
  QrRejectRoundRequest,
  QrRoundDetail,
  QrStaffBill,
  QrSummaryResponse,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';
import { Permission } from '@rms/permissions';
import { formatRupees } from '@rms/shared';

import { BillsService } from '../bills/bills.service';
import { actorCan } from '../common/auth/actor-permissions';
import type { Actor } from '../common/auth/authenticated-request';
import { roleCan } from '../common/auth/role-access';
import { errorDiagnostics } from '../common/logging/error-diagnostics';
import { NotificationsService } from '../notifications/notifications.service';
import { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';
import { computeTotals, dominantMethod, lineSubtotal, toTotalsDto } from './qr-billing';
import { QrGuestRepository } from './qr-guest.repository';
import { QrNotifier } from './qr-notifier.service';
import { type QrRoundCardRecord, QrStaffRepository } from './qr-staff.repository';
import { isCaptainAvailable, roundDisplayStatus } from './qr-status';
import { computeSessionBill, queueCard, shareDtos } from './qr-views';

/** How long approved/rejected rounds stay on the queue. */
const QUEUE_HISTORY_MS = 3 * 60 * 60_000;
const ALERT_HISTORY_MS = 2 * 60 * 60_000;

@Injectable()
export class QrStaffService {
  private readonly logger = new Logger(QrStaffService.name);

  constructor(
    private readonly repository: QrStaffRepository,
    private readonly guests: QrGuestRepository,
    private readonly notifier: QrNotifier,
    private readonly realtime: QrRealtimePublisher,
    private readonly bills: BillsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Owner captain of the round, or anyone who can manage QR ordering (managers). */
  canAct(actor: Actor, round: { ownerCaptainUserId: string | null }): boolean {
    if (actorCan(actor, Permission.QR_ORDER_MANAGE)) return true;
    return (
      actorCan(actor, Permission.QR_ORDER_APPROVE) && round.ownerCaptainUserId === actor.userId
    );
  }

  async queue(actor: Actor, query: QrQueueQuery): Promise<QrQueueResponse> {
    const restaurant = await this.restaurant(actor);
    const mine = query.scope === 'mine' ? actor.userId : null;
    const now = new Date();
    const [rounds, billSessions, waiting] = await Promise.all([
      this.repository.findQueueRounds(
        actor.restaurantId,
        mine,
        new Date(now.getTime() - QUEUE_HISTORY_MS),
      ),
      this.repository.findBillRequests(actor.restaurantId, mine),
      this.repository.countMyWaiting(actor.restaurantId, actor.userId),
    ]);
    const cards = rounds.map((round) =>
      queueCard(round, restaurant.defaultGstRate, this.canAct(actor, round)),
    );
    const billRequested = await Promise.all(
      billSessions.map(async (session) => {
        const view = await this.guests.findSessionView(actor.restaurantId, session.id);
        const bill = view ? computeSessionBill(view, restaurant.defaultGstRate) : null;
        return {
          sessionId: session.id,
          table: { id: session.table.id, number: session.table.tableNumber },
          requestedAt: (session.billRequestedAt ?? now).toISOString(),
          payable: (bill?.totals.payable ?? new Prisma.Decimal(0)).toFixed(2),
          sharesPaid: session.shares.filter((share) => share.status === 'PAID').length,
          sharesTotal: session.shares.length,
          paymentRequested: session.shares.some((share) => share.status === 'PAYMENT_REQUESTED'),
          captain: session.table.captain,
        };
      }),
    );
    return {
      scope: query.scope,
      awaiting: cards.filter((card) => card.status === 'awaiting' || card.status === 'escalated'),
      sentToKitchen: cards.filter((card) =>
        ['approved', 'preparing', 'ready'].includes(card.status),
      ),
      billRequested,
      rejected: cards
        .filter((card) => card.status === 'rejected')
        .sort((a, b) => (b.rejectedAt ?? '').localeCompare(a.rejectedAt ?? '')),
      myWaitingCount: waiting.count,
      oldestWaitingSince: waiting.oldest?.toISOString() ?? null,
      escalationMinutes: restaurant.qrEscalationMinutes,
      canManage: actorCan(actor, Permission.QR_ORDER_MANAGE),
      serverTime: now.toISOString(),
    };
  }

  async summary(actor: Actor): Promise<QrSummaryResponse> {
    const restaurant = await this.restaurant(actor);
    const canManage = actorCan(actor, Permission.QR_ORDER_MANAGE);
    if (canManage) await this.repository.resolveStaleAlerts(actor.restaurantId, new Date());
    const [waiting, openAlerts] = await Promise.all([
      this.repository.countMyWaiting(actor.restaurantId, actor.userId),
      canManage ? this.repository.countOpenAlerts(actor.restaurantId) : Promise.resolve(0),
    ]);
    return {
      enabled: restaurant.qrOrderingEnabled,
      myWaitingCount: waiting.count,
      oldestWaitingSince: waiting.oldest?.toISOString() ?? null,
      openAlerts,
      escalationMinutes: restaurant.qrEscalationMinutes,
      serverTime: new Date().toISOString(),
    };
  }

  async round(actor: Actor, roundId: string): Promise<QrRoundDetail> {
    const restaurant = await this.restaurant(actor);
    const round = await this.repository.findRound(actor.restaurantId, roundId);
    if (!round) throw new NotFoundException('Order not found');
    return this.toDetail(actor, round, restaurant);
  }

  async approve(
    actor: Actor,
    roundId: string,
    input: QrApproveRoundRequest,
  ): Promise<QrRoundDetail> {
    const now = new Date();
    const edits = new Map(
      input.items.map((item) => [
        item.id,
        { quantity: item.quantity, outOfStock: item.outOfStock },
      ]),
    );
    let outcome: { kotIds: string[]; sessionId: string; tableId: string };
    try {
      outcome = await this.repository.withLockedRound(
        actor.restaurantId,
        roundId,
        async ({ round, tx }) => {
          this.requireActionable(actor, round);
          const result = await this.repository.approveRound(tx, {
            restaurantId: actor.restaurantId,
            roundId,
            sessionId: round.sessionId,
            tableId: round.tableId,
            approverUserId: actor.userId,
            edits,
            note: input.note?.trim() || null,
            now,
          });
          if (result.kind === 'empty') {
            throw new BadRequestException(
              'Every item was removed. Reject the order instead so the guest is told why.',
            );
          }
          if (result.kind === 'table-busy') {
            throw new ConflictException(
              'This table’s bill is already paid. Ask staff to reset it.',
            );
          }
          return { kotIds: result.kotIds, sessionId: round.sessionId, tableId: round.tableId };
        },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A kitchen ticket number was just used. Approve again.');
      }
      throw error;
    }
    await this.notifications.ticketSent(actor.restaurantId, outcome.kotIds);
    await this.notifier.live(actor.restaurantId, [outcome.sessionId], {
      kind: 'round.approved',
      tableId: outcome.tableId,
      roundId,
    });
    return this.round(actor, roundId);
  }

  async reject(actor: Actor, roundId: string, input: QrRejectRoundRequest): Promise<QrRoundDetail> {
    const now = new Date();
    const round = await this.repository.withLockedRound(
      actor.restaurantId,
      roundId,
      async ({ round: locked, tx }) => {
        this.requireActionable(actor, locked);
        await this.repository.rejectRound(tx, roundId, actor.userId, input.reason.trim(), now);
        return locked;
      },
    );
    await this.notifier.live(actor.restaurantId, [round.sessionId], {
      kind: 'round.rejected',
      tableId: round.tableId,
      roundId,
    });
    return this.round(actor, roundId);
  }

  async onMyWay(actor: Actor, roundId: string): Promise<QrRoundDetail> {
    const now = new Date();
    const round = await this.repository.withLockedRound(
      actor.restaurantId,
      roundId,
      async ({ round: locked, tx }) => {
        this.requireActionable(actor, locked);
        await this.repository.markOnMyWay(tx, roundId, now);
        return locked;
      },
    );
    await this.notifier.live(actor.restaurantId, [round.sessionId], {
      kind: 'round.on-my-way',
      tableId: round.tableId,
      roundId,
    });
    return this.round(actor, roundId);
  }

  async bill(actor: Actor, sessionId: string): Promise<QrStaffBill> {
    const restaurant = await this.restaurant(actor);
    const session = await this.guests.findSessionView(actor.restaurantId, sessionId);
    const table = await this.repository.findSessionTable(actor.restaurantId, sessionId);
    if (!session || !table) throw new NotFoundException('Bill not found');
    const bill = computeSessionBill(session, restaurant.defaultGstRate);
    return {
      sessionId,
      table: { id: table.table.id, number: table.table.tableNumber },
      orderId: session.order?.id ?? null,
      billId: session.order?.bill?.id ?? null,
      requestedAt: session.billRequestedAt?.toISOString() ?? null,
      roundCount: session.rounds.filter((round) => round.status === 'APPROVED').length,
      guestCount: session.guests.length,
      lines: bill.lines,
      totals: toTotalsDto(bill.totals),
      payable: bill.totals.payable.toFixed(2),
      paid: bill.paid.toFixed(2),
      remaining: bill.remaining.toFixed(2),
      splitMode: session.splitMode,
      shares: shareDtos(session, null),
      hasUpiQr: await this.repository.hasUpiQr(actor.restaurantId),
      settled: bill.settled,
    };
  }

  /** Staff confirm a share they have verified (UPI against the restaurant QR, cash or card). */
  async recordSharePayment(
    actor: Actor,
    shareId: string,
    input: QrRecordSharePaymentRequest,
  ): Promise<QrStaffBill> {
    const share = await this.repository.findShare(actor.restaurantId, shareId);
    if (!share) throw new NotFoundException('Share not found');
    await this.requireSessionActor(actor, share.sessionId);
    const amount = this.positiveAmount(input.amount);
    await this.repository.withLockedSession(actor.restaurantId, share.sessionId, async (tx) => {
      const count = await this.repository.markSharePaid(tx, shareId, {
        method: input.method,
        amount,
        referenceNumber: input.referenceNumber?.trim() || null,
        userId: actor.userId,
        now: new Date(),
      });
      if (!count) throw new ConflictException('This share is already paid');
    });
    return this.afterPayment(actor, share.sessionId);
  }

  /** "Collect at table": record a payment that no guest share covers. */
  async collectAtTable(
    actor: Actor,
    sessionId: string,
    input: QrCollectAtTableRequest,
  ): Promise<QrStaffBill> {
    await this.requireSessionActor(actor, sessionId);
    const amount = this.positiveAmount(input.amount);
    await this.repository.withLockedSession(actor.restaurantId, sessionId, async (tx, found) => {
      if (!found) throw new NotFoundException('Bill not found');
      await this.repository.createPaidShare(tx, {
        restaurantId: actor.restaurantId,
        sessionId,
        label: 'Collected at table',
        method: input.method,
        amount,
        referenceNumber: input.referenceNumber?.trim() || null,
        userId: actor.userId,
        now: new Date(),
      });
    });
    return this.afterPayment(actor, sessionId);
  }

  async captainOptions(actor: Actor, tableId?: string): Promise<QrCaptainOptionsResponse> {
    const now = new Date();
    const [candidates, table] = await Promise.all([
      this.repository.findCaptainCandidates(actor.restaurantId),
      tableId ? this.repository.findTableCaptain(actor.restaurantId, tableId) : null,
    ]);
    const eligible = candidates.filter((user) => roleCan(user.role, Permission.TABLE_BE_CAPTAIN));
    const available = eligible.filter((user) => isCaptainAvailable(user, now));
    const lightest = available.reduce<(typeof available)[number] | null>((best, user) => {
      if (user.id === table?.captainUserId) return best;
      if (!best) return user;
      const score = (u: typeof user): number => u.activeTables + u.pendingOrders * 2;
      return score(user) < score(best) ? user : best;
    }, null);
    return {
      data: eligible.map((user) => ({
        id: user.id,
        name: user.name,
        activeTables: user.activeTables,
        pendingOrders: user.pendingOrders,
        available: isCaptainAvailable(user, now),
        lightestLoad: user.id === lightest?.id,
        isCurrent: user.id === table?.captainUserId,
      })),
    };
  }

  async assignCaptain(
    actor: Actor,
    tableId: string,
    input: QrAssignCaptainRequest,
  ): Promise<QrAssignCaptainResponse> {
    const restaurant = await this.restaurant(actor);
    const captain = await this.repository.findCaptainCandidate(
      actor.restaurantId,
      input.captainUserId,
    );
    if (!captain) throw new NotFoundException('Captain not found');
    if (captain.status !== 'ACTIVE') {
      throw new BadRequestException({ message: ['captainUserId: User is not active'] });
    }
    if (!roleCan(captain.role, Permission.TABLE_BE_CAPTAIN)) {
      throw new BadRequestException({
        message: ['captainUserId: User is not eligible to be a captain'],
      });
    }
    const result = await this.repository.assignCaptain({
      restaurantId: actor.restaurantId,
      tableId,
      captainUserId: captain.id,
      moveWaiting: input.moveWaitingOrders,
      actorUserId: actor.userId,
      escalationMinutes: restaurant.qrEscalationMinutes,
      captainName: captain.name,
      now: new Date(),
    });
    if (!result) throw new NotFoundException('Table not found');

    for (const moved of result.moved) {
      const round = await this.repository.findRound(actor.restaurantId, moved.id);
      if (!round) continue;
      const card = queueCard(round, restaurant.defaultGstRate, true);
      await this.notifier.roundSubmitted({
        restaurantId: actor.restaurantId,
        captainUserId: captain.id,
        roundId: round.id,
        tableId,
        tableNumber: round.table.tableNumber,
        roundNumber: round.roundNumber,
        itemCount: card.itemCount,
        total: card.total,
      });
    }
    const sessions = await this.repository.findOpenSessionIdsForTable(actor.restaurantId, tableId);
    await this.notifier.live(
      actor.restaurantId,
      sessions.map((session) => session.id),
      { kind: 'captain.changed', tableId },
    );
    return {
      tableId,
      captain: { id: captain.id, name: captain.name },
      movedRounds: result.moved.length,
    };
  }

  async alerts(actor: Actor): Promise<QrAlertsResponse> {
    const restaurant = await this.restaurant(actor);
    const now = new Date();
    await this.repository.resolveStaleAlerts(actor.restaurantId, now);
    const records = await this.repository.findAlerts(
      actor.restaurantId,
      new Date(now.getTime() - ALERT_HISTORY_MS),
    );
    const alerts: QrAlert[] = records.map((record) => {
      const round = record.round;
      const subtotal = round ? round.subtotal : null;
      return {
        id: record.id,
        kind: record.kind,
        status: record.status,
        table: { id: record.table.id, number: record.table.tableNumber },
        roundId: round?.id ?? null,
        roundNumber: round?.roundNumber ?? null,
        captain: round?.owner ?? record.table.captain ?? null,
        guestCount: round?.session._count.guests ?? 0,
        itemCount: round?.items.reduce((count, item) => count + item.quantity, 0) ?? 0,
        total: subtotal
          ? computeTotals({ subtotal, gstRate: restaurant.defaultGstRate }).payable.toFixed(2)
          : null,
        waitingSince: round?.submittedAt.toISOString() ?? null,
        resolution: record.resolution,
        createdAt: record.createdAt.toISOString(),
        resolvedAt: record.resolvedAt?.toISOString() ?? null,
      };
    });
    return {
      open: alerts.filter((alert) => alert.status === 'OPEN'),
      recent: alerts.filter((alert) => alert.status !== 'OPEN'),
      escalationMinutes: restaurant.qrEscalationMinutes,
      serverTime: now.toISOString(),
    };
  }

  async dismissAlert(actor: Actor, alertId: string): Promise<{ ok: true }> {
    if (!(await this.repository.dismissAlert(actor.restaurantId, alertId, actor.userId))) {
      throw new NotFoundException('Alert not found or already handled');
    }
    await this.notifier.live(actor.restaurantId, [], { kind: 'alert.changed' });
    return { ok: true };
  }

  async floor(actor: Actor): Promise<QrFloorResponse> {
    const restaurant = await this.restaurant(actor);
    const floor = await this.repository.floor(actor.restaurantId);
    const waiting = new Map<string, { submittedAt: Date; escalated: boolean }>();
    for (const round of floor.waiting) {
      const current = waiting.get(round.tableId);
      waiting.set(round.tableId, {
        submittedAt: current?.submittedAt ?? round.submittedAt,
        escalated: (current?.escalated ?? false) || round.escalatedAt !== null,
      });
    }
    const billRequested = new Set(floor.billRequested.map((session) => session.tableId));
    return {
      enabled: restaurant.qrOrderingEnabled,
      tables: floor.tables.map((table) => ({
        tableId: table.id,
        waitingSince: waiting.get(table.id)?.submittedAt.toISOString() ?? null,
        escalated: waiting.get(table.id)?.escalated ?? false,
        billRequested: billRequested.has(table.id),
        noCaptain: table.captainUserId === null,
      })),
      escalationMinutes: restaurant.qrEscalationMinutes,
      serverTime: new Date().toISOString(),
    };
  }

  realtimeConfig(actor: Actor): QrRealtimeConfig {
    this.requireRealtimeAccess(actor);
    return {
      ...this.realtime.publicConfig(),
      channel: this.realtime.staffChannel(actor.restaurantId),
    };
  }

  authorizeChannel(actor: Actor, input: QrChannelAuthRequest): QrChannelAuthResponse {
    this.requireRealtimeAccess(actor);
    return this.realtime.authorize(this.realtime.staffChannel(actor.restaurantId), input);
  }

  // -------------------------------------------------------------------------

  private requireRealtimeAccess(actor: Actor): void {
    const allowed = [Permission.QR_ORDER_READ, Permission.KOT_READ, Permission.FLOOR_READ].some(
      (permission) => actorCan(actor, permission),
    );
    if (!allowed) throw new ForbiddenException('You do not have permission to perform this action');
  }

  private requireActionable(
    actor: Actor,
    round: { status: string; ownerCaptainUserId: string | null } | null,
  ): asserts round is NonNullable<typeof round> & {
    status: 'AWAITING_APPROVAL';
    sessionId: string;
    tableId: string;
  } {
    if (!round) throw new NotFoundException('Order not found');
    if (!this.canAct(actor, round)) {
      throw new ForbiddenException('Only this table’s captain or a manager can act on this order');
    }
    if (round.status !== 'AWAITING_APPROVAL') {
      throw new ConflictException(
        round.status === 'APPROVED'
          ? 'This order was already sent to the kitchen'
          : 'This order was already rejected',
      );
    }
  }

  /** Payments on a table: its captain, or a manager. */
  private async requireSessionActor(actor: Actor, sessionId: string): Promise<void> {
    const session = await this.repository.findSessionTable(actor.restaurantId, sessionId);
    if (!session) throw new NotFoundException('Bill not found');
    if (session.status !== 'OPEN') throw new ConflictException('This bill is already settled');
    if (!this.canAct(actor, { ownerCaptainUserId: session.table.captainUserId })) {
      throw new ForbiddenException('Only this table’s captain or a manager can record payments');
    }
  }

  private positiveAmount(value: string): Prisma.Decimal {
    const amount = new Prisma.Decimal(value);
    if (amount.lte(0)) throw new BadRequestException({ message: ['amount: Enter an amount'] });
    return amount;
  }

  /**
   * Once paid shares cover the rounded total, settle the staff bill with one COMPLETED payment
   * (the bill model holds one settlement), which completes the order, schedules the table for
   * cleaning and closes the QR session.
   */
  private async afterPayment(actor: Actor, sessionId: string): Promise<QrStaffBill> {
    const restaurant = await this.restaurant(actor);
    const session = await this.guests.findSessionView(actor.restaurantId, sessionId);
    if (!session) throw new NotFoundException('Bill not found');
    const computed = computeSessionBill(session, restaurant.defaultGstRate);
    await this.notifier.live(actor.restaurantId, [sessionId], { kind: 'bill.changed' });
    if (computed.settled || !session.order || computed.remaining.gt(0)) {
      return this.bill(actor, sessionId);
    }
    try {
      const bill = await this.bills.generate(actor, session.order.id);
      const paid = await this.repository.findPaidShares(sessionId);
      const method =
        dominantMethod(
          paid
            .filter((share) => share.paymentMethod && share.paidAmount)
            .map((share) => ({
              method: share.paymentMethod as 'CASH' | 'CARD' | 'UPI',
              amount: share.paidAmount as Prisma.Decimal,
            })),
        ) ?? 'CASH';
      const breakdown = paid
        .map(
          (share) => `${share.paymentMethod} ${formatRupees((share.paidAmount ?? 0).toString())}`,
        )
        .join(', ');
      await this.bills.recordPayment(actor, bill.id, {
        paymentMethod: method,
        amount: bill.totalAmount,
        referenceNumber: `QR split: ${breakdown} (collected ${formatRupees(
          computed.paid.toFixed(2),
        )})`.slice(0, 255),
      });
    } catch (error) {
      this.logger.warn('QR bill could not be settled automatically', errorDiagnostics(error));
      const reason = error instanceof HttpException ? error.message : 'Try again from Billing.';
      throw new ConflictException(`Payment recorded, but the bill couldn’t be closed: ${reason}`);
    }
    return this.bill(actor, sessionId);
  }

  private async restaurant(actor: Actor): Promise<{
    qrOrderingEnabled: boolean;
    qrEscalationMinutes: number;
    defaultGstRate: Prisma.Decimal;
  }> {
    const restaurant = await this.repository.findRestaurantQrState(actor.restaurantId);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant;
  }

  private async toDetail(
    actor: Actor,
    round: QrRoundCardRecord,
    restaurant: { qrEscalationMinutes: number; defaultGstRate: Prisma.Decimal },
  ): Promise<QrRoundDetail> {
    const guests = await this.repository.findSessionGuests(round.sessionId);
    // Current quantities: what the captain will approve (or did approve).
    const subtotal = lineSubtotal(round.items.filter((item) => item.status === 'ACTIVE'));
    return {
      roundId: round.id,
      sessionId: round.sessionId,
      table: { id: round.table.id, number: round.table.tableNumber },
      roundNumber: round.roundNumber,
      status: roundDisplayStatus(round, round.kots),
      guests: guests.map((guest) => ({ id: guest.id, name: guest.displayName })),
      note: round.note,
      items: round.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.menuItem.name,
        isVeg: item.menuItem.isVeg,
        destination: item.menuItem.itemType === 'BAR' ? 'BAR' : 'KITCHEN',
        requestedQuantity: item.requestedQuantity,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        specialInstructions: item.specialInstructions,
        status: item.status,
        addedBy: item.addedBy.displayName,
        available: item.menuItem.isAvailable,
      })),
      totals: toTotalsDto(computeTotals({ subtotal, gstRate: restaurant.defaultGstRate })),
      submittedAt: round.submittedAt.toISOString(),
      escalateAt: round.escalateAt?.toISOString() ?? null,
      escalatedAt: round.escalatedAt?.toISOString() ?? null,
      onMyWayAt: round.onMyWayAt?.toISOString() ?? null,
      approvedAt: round.approvedAt?.toISOString() ?? null,
      approvedBy: round.approvedBy,
      rejectedAt: round.rejectedAt?.toISOString() ?? null,
      rejectReason: round.rejectReason,
      captain: round.owner,
      canAct: this.canAct(actor, round) && round.status === 'AWAITING_APPROVAL',
      escalationMinutes: restaurant.qrEscalationMinutes,
      serverTime: new Date().toISOString(),
    };
  }
}
