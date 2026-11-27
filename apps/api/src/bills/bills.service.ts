import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { Permission } from '@rms/permissions';
import { buildPageMeta } from '@rms/shared';

import { actorCan } from '../common/auth/actor-permissions';
import type { Actor } from '../common/auth/authenticated-request';
import { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';
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
  private readonly logger = new Logger(BillsService.name);

  constructor(
    private readonly repository: BillsRepository,
    private readonly qrRealtime: QrRealtimePublisher,
  ) {}

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
    if (input.discount && !actorCan(actor, Permission.BILL_DISCOUNT))
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

  async recordPayment(
    actor: Actor,
    billId: string,
    input: RecordPaymentRequest,
  ): Promise<RecordPaymentResponse> {
    const { response, closedSessions } = await this.settle(actor, billId, input);
    if (closedSessions.length) {
      // Guest phones at a QR table move to "All paid"; the table session is over.
      await this.qrRealtime.publish(actor.restaurantId, closedSessions, {
        kind: 'session.closed',
        tableId: response.bill.table.id,
      });
    }
    return response;
  }

  private settle(
    actor: Actor,
    billId: string,
    input: RecordPaymentRequest,
  ): Promise<{ response: RecordPaymentResponse; closedSessions: string[] }> {
    return this.repository.withLockedOrder(actor.restaurantId, { billId }, async (context) => {
      const bill = this.requireBill(context.bill);
      if (bill.status === 'PAID') throw new ConflictException('Bill is already paid');
      if (bill.status !== 'OPEN')
        throw new ConflictException('Payments can only be recorded against open bills');
      const { order } = context;
      if (order?.status !== 'SUBMITTED')
        throw new ConflictException('Only a submitted order can be settled');
      this.requireSentItems(order);
      if (!billingSubtotal(order.items).equals(bill.subtotal))
        throw new ConflictException(
          'Order items have changed. Resync the bill before recording payment.',
        );
      const tip = new Prisma.Decimal(input.tipAmount ?? '0.00');
      const paymentTotal = bill.totalAmount.plus(tip);
      if (paymentTotal.greaterThan('9999999999.99')) {
        throw new BadRequestException({
          message: ['tipAmount: Total with tip exceeds the payment limit'],
        });
      }
      if (!new Prisma.Decimal(input.amount).equals(paymentTotal))
        throw new BadRequestException({
          message: ['amount: Payment must equal the bill total plus the optional tip'],
        });
      const paidAt = new Date();
      let payment: RecordPaymentResponse['payment'];
      try {
        payment = toPayment(
          await context.createPayment({
            paymentMethod: input.paymentMethod,
            amount: paymentTotal,
            ...(input.tipAmount !== undefined && { tipAmount: tip }),
            referenceNumber: input.paymentMethod === 'CASH' ? null : input.referenceNumber || null,
            recordedByUserId: actor.userId,
            status: 'COMPLETED',
            paidAt,
          }),
        );
      } catch (error) {
        if (error instanceof PaymentConflictError) throw new ConflictException(error.message);
        throw error;
      }
      const updated = await context.update({ status: 'PAID', paidAt });
      const completedAt = new Date();
      if (!(await context.completeOrder(order.status, completedAt))) {
        throw new ConflictException('Order status changed. Refresh the bill and try again.');
      }
      if (order.reservationId) await context.completeReservation(order.reservationId, 'SEATED');
      await this.markTableForCleaning(context, order.table.id);
      const closedSessions = await context.closeQrSessions(completedAt);
      return {
        response: {
          payment,
          bill: toBill(updated),
          order: { id: order.id, status: 'COMPLETED', completedAt: completedAt.toISOString() },
        },
        closedSessions,
      };
    });
  }

  private async markTableForCleaning(
    context: LockedBillingContext,
    tableId: string,
  ): Promise<void> {
    const failure = await context.withTableStatusSavepoint(async () => {
      const status = await context.getTableStatus();
      if (status?.code !== 'OCCUPIED') return;
      if (!(await context.updateTableStatus(status.id, 'NEEDS_CLEANING'))) {
        throw new Error('Table status changed before cleaning could be scheduled');
      }
    });
    if (failure) {
      this.logger.warn(`Unable to mark table ${tableId} for cleaning after payment`, failure.error);
    }
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
    const splitRate = bill.gstRate.div(2);
    const formattedRate = splitRate.toFixed(Math.max(2, splitRate.decimalPlaces()));
    const cgst = roundMoney(bill.gstAmount.div(2));
    const payment = bill.status === 'PAID' ? record?.payments[0] : undefined;
    return {
      bill: toBill(bill),
      restaurant: {
        name: bill.restaurant.name,
        address: bill.restaurant.address,
        gstNumber: bill.restaurant.gstNumber,
      },
      cgst: { rate: formattedRate, amount: cgst.toFixed(2) },
      sgst: { rate: formattedRate, amount: bill.gstAmount.minus(cgst).toFixed(2) },
      payment: payment
        ? {
            method: payment.paymentMethod,
            tipAmount: payment.tipAmount?.toFixed(2) ?? '0.00',
            amount: payment.amount?.toFixed(2) ?? bill.totalAmount.toFixed(2),
            referenceNumber: payment.referenceNumber,
            paidAt: payment.paidAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  private requireSentItems(order: LockedBillingContext['order']): void {
    if (
      order?.items.some(
        (item) =>
          item.quantity >
          (item.sentQuantity ?? item.kotItems.reduce((total, sent) => total + sent.quantity, 0)),
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
