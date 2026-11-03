import { Injectable } from '@nestjs/common';
import type { BillCancellationReasonsResponse, BillListQuery } from '@rms/api-contract';
import { Prisma } from '@rms/db';

import { completeOrderInTx } from '../common/database/order-lifecycle';
import { PrismaService } from '../common/database/prisma.service';

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
  table: { select: { id: true, tableNumber: true } },
  items: {
    where: { status: 'ACTIVE' as const },
    select: { id: true, quantity: true, unitPrice: true, menuItem: { select: { name: true } } },
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
  Pick<Prisma.BillUpdateInput, 'status' | 'cancellationReason'>;

export type PaymentRecord = Prisma.PaymentGetPayload<object>;
export type NewPayment = Pick<
  Prisma.PaymentUncheckedCreateInput,
  'paymentMethod' | 'amount' | 'referenceNumber' | 'recordedByUserId'
>;
export type SettlementResult = {
  payment: PaymentRecord;
  bill: BillRecord;
  order: { id: string; completedAt: Date | null };
};

/** Raised when the one-COMPLETED-payment-per-bill unique index rejects a settlement. */
export class PaymentConflictError extends Error {}

export type LockedBillingContext = {
  settle: (data: NewPayment) => Promise<SettlementResult>;
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
        const rows = candidate
          ? await tx.$queryRaw<
              { id: string }[]
            >`SELECT id FROM orders WHERE id = ${candidate}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`
          : [];
        const orderId = rows[0]?.id;
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
          settle: async (data) => {
            const paidAt = new Date();
            let payment: PaymentRecord;
            try {
              payment = await tx.payment.create({
                data: { ...data, billId: bill!.id, status: 'COMPLETED', paidAt },
              });
            } catch (error) {
              if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
                throw new PaymentConflictError();
              throw error;
            }
            const updated = await tx.bill.update({
              where: { id: bill!.id, restaurantId },
              data: { status: 'PAID', paidAt },
              include: billInclude,
            });
            if (!(await completeOrderInTx(tx, restaurantId, orderId!)))
              throw new PaymentConflictError();
            const order = await tx.order.findUniqueOrThrow({
              where: { id: orderId! },
              select: { id: true, completedAt: true },
            });
            return { payment, bill: updated, order };
          },
          update: (data) =>
            tx.bill.update({ where: { id: bill!.id, restaurantId }, data, include: billInclude }),
        });
      },
      { timeout: 15_000 },
    );
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
