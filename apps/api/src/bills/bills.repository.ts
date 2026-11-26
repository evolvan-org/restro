import { Injectable } from '@nestjs/common';
import type { BillCancellationReasonsResponse, BillListQuery } from '@rms/api-contract';
import { Prisma, type ReservationStatus } from '@rms/db';

import { lockOrderLifecycle } from '../common/database/order-lifecycle';
import { PrismaService } from '../common/database/prisma.service';
import { updateTableStatusIfCurrent } from '../common/database/table-lifecycle';

const restaurantSelect = {
  name: true,
  address: true,
  gstNumber: true,
  defaultGstRate: true,
  maxDiscountPercent: true,
  currency: true,
  timezone: true,
} satisfies Prisma.RestaurantSelect;
const orderSelect = {
  id: true,
  status: true,
  reservationId: true,
  table: { select: { id: true, tableNumber: true } },
  items: {
    where: { status: 'ACTIVE' as const },
    select: {
      id: true,
      quantity: true,
      kotItems: { select: { quantity: true } },
      unitPrice: true,
      menuItem: { select: { name: true } },
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.OrderSelect;
const billInclude = {
  restaurant: { select: restaurantSelect },
  order: { select: orderSelect },
} satisfies Prisma.BillInclude;
const invoiceInclude = {
  ...billInclude,
  payments: {
    where: { status: 'COMPLETED' as const },
    select: { paymentMethod: true, referenceNumber: true, paidAt: true },
    take: 1,
  },
} satisfies Prisma.BillInclude;

export type BillRecord = Prisma.BillGetPayload<{ include: typeof billInclude }>;
type InvoiceRecord = Prisma.BillGetPayload<{ include: typeof invoiceInclude }>;
type OrderRecord = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;
type RestaurantRecord = Prisma.RestaurantGetPayload<{ select: typeof restaurantSelect }>;
type BillAmounts = Pick<
  Prisma.BillUncheckedCreateInput,
  'subtotal' | 'discountAmount' | 'gstRate' | 'gstAmount' | 'totalAmount'
>;
type NewBill = BillAmounts &
  Pick<Prisma.BillUncheckedCreateInput, 'generatedByUserId' | 'generatedAt' | 'billNumber'>;
type BillChanges = Partial<BillAmounts> &
  Pick<Prisma.BillUpdateInput, 'status' | 'cancellationReason' | 'paidAt'>;

export type PaymentRecord = Prisma.PaymentGetPayload<object>;
export type NewPayment = Pick<
  Prisma.PaymentUncheckedCreateInput,
  'paymentMethod' | 'amount' | 'referenceNumber' | 'recordedByUserId' | 'status' | 'paidAt'
>;

/** Raised when the database rejects a duplicate payment. */
export class PaymentConflictError extends Error {
  constructor() {
    super('Bill is already paid');
  }
}

export type LockedBillingContext = {
  createPayment: (data: NewPayment) => Promise<PaymentRecord>;
  completeOrder: (
    expectedOrderStatus: OrderRecord['status'],
    completedAt: Date,
  ) => Promise<boolean>;
  completeReservation: (reservationId: string, expectedStatus: ReservationStatus) => Promise<void>;
  getTableStatus: () => Promise<{ id: string; code: string } | null>;
  updateTableStatus: (expectedStatusId: string, targetStatusCode: string) => Promise<boolean>;
  withTableStatusSavepoint: (change: () => Promise<void>) => Promise<{ error: unknown } | null>;
  /** Ends the QR visits on this order's table (bill paid). Returns their ids. */
  closeQrSessions: (closedAt: Date) => Promise<string[]>;
  order: OrderRecord | null;
  bill: BillRecord | null;
  restaurant: () => Promise<RestaurantRecord>;
  nextNumber: (year: number) => Promise<string>;
  create: (data: NewBill) => Promise<BillRecord>;
  update: (data: BillChanges) => Promise<BillRecord>;
};

@Injectable()
export class BillsRepository {
  constructor(private readonly prisma: PrismaService) {}

  cancellationReasons(restaurantId: string): Promise<BillCancellationReasonsResponse> {
    return this.prisma.billCancellationReason.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  withLockedOrder<T>(
    restaurantId: string,
    target: { orderId: string } | { billId: string },
    run: (context: LockedBillingContext) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const candidate =
          'orderId' in target
            ? target.orderId
            : (
                await tx.bill.findFirst({
                  where: { id: target.billId, restaurantId },
                  select: { orderId: true },
                })
              )?.orderId;
        const lockedOrder = candidate
          ? await lockOrderLifecycle(tx, restaurantId, candidate)
          : null;
        const orderId = lockedOrder?.id;
        if (orderId)
          await tx.$queryRaw`SELECT id FROM bills WHERE order_id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
        const order = orderId
          ? await tx.order.findFirst({ where: { id: orderId, restaurantId }, select: orderSelect })
          : null;
        const bill = orderId
          ? await tx.bill.findFirst({ where: { orderId, restaurantId }, include: billInclude })
          : null;
        return run({
          order,
          bill,
          restaurant: async () => {
            await tx.$queryRaw`SELECT id FROM restaurants WHERE id = ${restaurantId}::uuid FOR UPDATE`;
            return tx.restaurant.findUniqueOrThrow({
              where: { id: restaurantId },
              select: restaurantSelect,
            });
          },
          nextNumber: async (year) => {
            const prefix = `INV-${year}-`;
            const pattern = `^INV-${year}-[0-9]+$`;
            const numbers = await tx.$queryRaw<
              { next: string }[]
            >`SELECT (COALESCE(MAX(SUBSTRING(bill_number FROM ${prefix.length + 1}::integer)::numeric), 0) + 1)::text AS next FROM bills WHERE restaurant_id = ${restaurantId}::uuid AND bill_number ~ ${pattern}`;
            return `${prefix}${(numbers[0]?.next ?? '1').padStart(6, '0')}`;
          },
          create: (data) =>
            tx.bill.create({
              data: { ...data, restaurantId, orderId: orderId!, status: 'OPEN' },
              include: billInclude,
            }),
          createPayment: async (data) => {
            try {
              return await tx.payment.create({ data: { ...data, billId: bill!.id } });
            } catch (error) {
              if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
                throw new PaymentConflictError();
              throw error;
            }
          },
          completeOrder: async (expectedStatus, completedAt) => {
            const { count } = await tx.order.updateMany({
              where: { id: orderId!, restaurantId, status: expectedStatus },
              data: { status: 'COMPLETED', completedAt },
            });
            return count > 0;
          },
          completeReservation: async (id, expectedStatus) => {
            await tx.reservation.updateMany({
              where: { id, restaurantId, status: expectedStatus },
              data: { status: 'COMPLETED' },
            });
          },
          getTableStatus: async () => {
            const table = await tx.restaurantTable.findFirst({
              where: {
                id: lockedOrder!.tableId,
                restaurantId,
                isActive: true,
                currentStatus: { restaurantId },
              },
              select: { currentStatus: { select: { id: true, code: true } } },
            });
            return table?.currentStatus ?? null;
          },
          updateTableStatus: async (expectedStatusId, code) => {
            const targetStatus = await tx.tableStatus.findFirst({
              where: { restaurantId, code, isActive: true },
              select: { id: true },
            });
            if (!targetStatus) throw new Error(`Active table status ${code} is not configured`);
            return updateTableStatusIfCurrent(
              tx,
              restaurantId,
              lockedOrder!.tableId,
              expectedStatusId,
              targetStatus.id,
            );
          },
          withTableStatusSavepoint: (change) => this.withTableStatusSavepoint(tx, change),
          closeQrSessions: async (closedAt) => {
            // Every open QR visit on the table ends with the bill, including guests who only
            // joined while staff took the order (their visit is never linked to it); otherwise the
            // next party would join the same visit and see the previous guests.
            const sessions = await tx.qrSession.findMany({
              where: {
                restaurantId,
                status: 'OPEN',
                OR: [{ orderId: orderId! }, { tableId: lockedOrder!.tableId }],
              },
              select: { id: true },
            });
            if (sessions.length) {
              await tx.qrSession.updateMany({
                where: { id: { in: sessions.map((session) => session.id) } },
                data: { status: 'CLOSED', closedAt },
              });
            }
            return sessions.map((session) => session.id);
          },
          update: (data) =>
            tx.bill.update({ where: { id: bill!.id, restaurantId }, data, include: billInclude }),
        });
      },
      { timeout: 15_000 },
    );
  }

  private async withTableStatusSavepoint(
    tx: Prisma.TransactionClient,
    change: () => Promise<void>,
  ): Promise<{ error: unknown } | null> {
    // The table was locked before the savepoint. Rolling back here retains that lock.
    await tx.$executeRaw`SAVEPOINT billing_table_closure`;
    let failure: { error: unknown } | null = null;
    try {
      await change();
    } catch (error) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT billing_table_closure`;
      failure = { error };
    }
    await tx.$executeRaw`RELEASE SAVEPOINT billing_table_closure`;
    return failure;
  }

  find(
    restaurantId: string,
    target: { id: string } | { orderId: string },
  ): Promise<BillRecord | null> {
    return this.prisma.$transaction(
      (tx) => tx.bill.findFirst({ where: { ...target, restaurantId }, include: billInclude }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  list(
    restaurantId: string,
    query: BillListQuery,
  ): Promise<{ items: BillRecord[]; total: number }> {
    const where: Prisma.BillWhereInput = { restaurantId, status: query.status };
    return this.prisma.$transaction(
      async (tx) => {
        const total = await tx.bill.count({ where });
        const items = await tx.bill.findMany({
          where,
          include: billInclude,
          orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        return { items, total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  invoice(restaurantId: string, id: string): Promise<InvoiceRecord | null> {
    return this.prisma.$transaction(
      (tx) =>
        tx.bill.findFirst({
          where: { id, restaurantId },
          include: invoiceInclude,
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
