import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Bill,
  BillCancellationReasonsResponse,
  BillInvoice,
  BillListQuery,
  BillListResponse,
  CancelBillRequest,
  RecordPaymentRequest,
  RecordPaymentResponse,
  UpdateBillRequest,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';
import { Permission, roleHasPermission } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';

import type { Actor } from '../common/auth/authenticated-request';
import { billingSubtotal, calculateBill, financialYear, roundMoney } from './billing-calc';
import { toBill, toPayment } from './bills.mapper';
import {
  type BillRecord,
  BillsRepository,
  type LockedBillingContext,
  PaymentConflictError,
} from './bills.repository';

@Injectable()
export class BillsService {
  constructor(private readonly repository: BillsRepository) {}

  cancellationReasons(actor: Actor): Promise<BillCancellationReasonsResponse> {
    return this.repository.cancellationReasons(actor.restaurantId);
  }

  generate(actor: Actor, orderId: string): Promise<Bill> {
    return this.repository.withLockedOrder(actor.restaurantId, { orderId }, async (context) => {
      if (!context.order) throw new NotFoundException('Order not found');
      if (context.order.status !== 'SUBMITTED')
        throw new ConflictException('Only a submitted order can be billed');
      this.requireSentItems(context.order);
      if (context.bill?.status === 'PAID')
        throw new ConflictException('Paid bills cannot be regenerated');
      if (context.bill?.status === 'OPEN') return toBill(context.bill);
      const restaurant = await context.restaurant();
      const gstRate = context.bill?.gstRate ?? restaurant.defaultGstRate;
      const amounts = calculateBill({
        subtotal: billingSubtotal(context.order.items),
        gstRate,
        savedDiscount: new Prisma.Decimal(0),
        maxDiscountPercent: restaurant.maxDiscountPercent,
      });
      if (context.bill)
        return toBill(
          await context.update({ ...amounts, status: 'OPEN', cancellationReason: null }),
        );
      const generatedAt = new Date();
      const billNumber = await context.nextNumber(financialYear(generatedAt, restaurant.timezone));
      return toBill(
        await context.create({
          ...amounts,
          gstRate,
          billNumber,
          generatedAt,
          generatedByUserId: actor.userId,
        }),
      );
    });
  }

  async get(actor: Actor, target: { id: string } | { orderId: string }): Promise<Bill> {
    return toBill(this.requireBill(await this.repository.find(actor.restaurantId, target)));
  }

  async list(actor: Actor, query: BillListQuery): Promise<BillListResponse> {
    const { items, total } = await this.repository.list(actor.restaurantId, query);
    return { data: items.map(toBill), meta: buildPageMeta(query.page, query.pageSize, total) };
  }

  update(actor: Actor, billId: string, input: UpdateBillRequest): Promise<Bill> {
    if (input.discount && !roleHasPermission(actor.role, Permission.BILL_DISCOUNT))
      throw new ForbiddenException('Missing bill discount permission');
    return this.repository.withLockedOrder(actor.restaurantId, { billId }, async (context) => {
      const bill = this.requireOpen(context.bill);
      const restaurant = await context.restaurant();
      const amounts = calculateBill({
        subtotal: input.resyncItems ? billingSubtotal(bill.order.items) : bill.subtotal,
        gstRate: bill.gstRate,
        savedDiscount: bill.discountAmount,
        maxDiscountPercent: restaurant.maxDiscountPercent,
        discount: input.discount,
      });
      return toBill(await context.update(amounts));
    });
  }

  cancel(actor: Actor, billId: string, input: CancelBillRequest): Promise<Bill> {
    return this.repository.withLockedOrder(actor.restaurantId, { billId }, async (context) => {
      this.requireOpen(context.bill);
      return toBill(
        await context.update({ status: 'CANCELLED', cancellationReason: input.reason || null }),
      );
    });
  }

  recordPayment(
    actor: Actor,
    billId: string,
    input: RecordPaymentRequest,
  ): Promise<RecordPaymentResponse> {
    return this.repository.withLockedOrder(actor.restaurantId, { billId }, async (context) => {
      const bill = this.requireBill(context.bill);
      if (bill.status === 'PAID') throw new ConflictException('Bill is already paid');
      if (bill.status !== 'OPEN')
        throw new ConflictException('Payments can only be recorded against open bills');
      if (context.order?.status !== 'SUBMITTED')
        throw new ConflictException('Only a submitted order can be settled');
      this.requireSentItems(context.order);
      if (!new Prisma.Decimal(input.amount).equals(bill.totalAmount))
        throw new BadRequestException({
          message: ['amount: Payment must equal the bill total; split payments are not supported'],
        });
      try {
        const result = await context.settle({
          paymentMethod: input.paymentMethod,
          amount: bill.totalAmount,
          referenceNumber: input.paymentMethod === 'CASH' ? null : input.referenceNumber || null,
          recordedByUserId: actor.userId,
        });
        return {
          payment: toPayment(result.payment),
          bill: toBill(result.bill),
          order: {
            id: result.order.id,
            status: 'COMPLETED',
            completedAt: result.order.completedAt?.toISOString() ?? null,
          },
        };
      } catch (error) {
        if (error instanceof PaymentConflictError)
          throw new ConflictException('Bill is already paid');
        throw error;
      }
    });
  }

  async invoice(actor: Actor, id: string): Promise<BillInvoice> {
    const record = await this.repository.invoice(actor.restaurantId, id);
    const bill = this.requireBill(record);
    if (bill.status === 'CANCELLED')
      throw new ConflictException('Cancelled bills cannot be printed');
    if (!billingSubtotal(bill.order.items).equals(bill.subtotal))
      throw new ConflictException(
        'Order items have changed. Resync the open bill before printing.',
      );
    const cgst = roundMoney(bill.gstAmount.div(2));
    const payment = bill.status === 'PAID' ? record?.payments[0] : undefined;
    return {
      bill: toBill(bill),
      restaurant: {
        name: bill.restaurant.name,
        address: bill.restaurant.address,
        gstNumber: bill.restaurant.gstNumber,
      },
      cgst: { rate: bill.gstRate.div(2).toString(), amount: cgst.toFixed(2) },
      sgst: { rate: bill.gstRate.div(2).toString(), amount: bill.gstAmount.minus(cgst).toFixed(2) },
      payment: payment
        ? {
            method: payment.paymentMethod,
            referenceNumber: payment.referenceNumber,
            paidAt: payment.paidAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  private requireSentItems(order: LockedBillingContext['order']): void {
    if (
      order?.items.some(
        (item) => item.quantity > item.kotItems.reduce((total, sent) => total + sent.quantity, 0),
      )
    ) {
      throw new ConflictException(
        'Send or remove unsent quantities from the order menu before generating a bill or recording payment',
      );
    }
  }

  private requireBill(record: BillRecord | null): BillRecord {
    if (!record) throw new NotFoundException('Bill not found');
    return record;
  }

  private requireOpen(record: BillRecord | null): BillRecord {
    const bill = this.requireBill(record);
    if (bill.status !== 'OPEN') throw new ConflictException('Only open bills can be changed');
    return bill;
  }
}
