import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { recordPaymentRequestSchema } from '@rms/api-contract';
import { Prisma } from '@rms/db';

import type { Actor } from '../common/auth/authenticated-request';
import type { QrRealtimePublisher } from '../notifications/qr-realtime.publisher';
import { type BillsRepository, PaymentConflictError } from './bills.repository';
import { BillsService } from './bills.service';

const actor = { userId: 'u1', restaurantId: 'r1', role: 'RECEPTION' } as unknown as Actor;
const D = (v: string): Prisma.Decimal => new Prisma.Decimal(v);

function setup(
  bill: { status: string; subtotal: Prisma.Decimal; totalAmount: Prisma.Decimal } | null,
  orderStatus = 'SUBMITTED',
  createPayment = jest.fn(),
  paidQrShares = jest.fn().mockResolvedValue([]),
) {
  const repository = {
    withLockedOrder: (_r: string, _t: unknown, run: (c: unknown) => unknown) =>
      run({
        bill,
        order: {
          status: orderStatus,
          items: [{ quantity: 1, unitPrice: D('100.00'), kotItems: [{ quantity: 1 }] }],
        },
        createPayment,
        paidQrShares,
      }),
  } as unknown as BillsRepository;
  const qrRealtime = { publish: jest.fn() } as unknown as QrRealtimePublisher;
  return { service: new BillsService(repository, qrRealtime), createPayment };
}

describe('BillsService.recordPayment', () => {
  const open = { status: 'OPEN', subtotal: D('100.00'), totalAmount: D('118.00') };

  it('404s for an unknown bill', async () => {
    await expect(
      setup(null).service.recordPayment(actor, 'b', { paymentMethod: 'CASH', amount: '118.00' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['PAID', 'CANCELLED'])('409s for a %s bill', async (status) => {
    const { service, createPayment } = setup({ ...open, status });
    await expect(
      service.recordPayment(actor, 'b', { paymentMethod: 'CASH', amount: '118.00' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('400s when amount differs from the total', async () => {
    const { service, createPayment } = setup(open);
    await expect(
      service.recordPayment(actor, 'b', { paymentMethod: 'CASH', amount: '100.00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('maps a unique-index violation to 409', async () => {
    const { service } = setup(
      open,
      'SUBMITTED',
      jest.fn().mockRejectedValue(new PaymentConflictError()),
    );
    await expect(
      service.recordPayment(actor, 'b', { paymentMethod: 'CASH', amount: '118.00' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('discards the reference for CASH and keeps it for UPI', async () => {
    const createPayment = jest.fn().mockRejectedValue(new PaymentConflictError());
    const { service } = setup(open, 'SUBMITTED', createPayment);
    await service
      .recordPayment(actor, 'b', { paymentMethod: 'CASH', amount: '118.00', referenceNumber: 'x' })
      .catch(() => undefined);
    await service
      .recordPayment(actor, 'b', { paymentMethod: 'UPI', amount: '118.00', referenceNumber: 'x' })
      .catch(() => undefined);
    expect(createPayment.mock.calls[0][0]).toMatchObject({
      referenceNumber: null,
      recordedByUserId: 'u1',
    });
    expect(createPayment.mock.calls[1][0]).toMatchObject({ referenceNumber: 'x' });
  });

  it('rejects a split that leaves a balance due', async () => {
    const { service, createPayment } = setup(open);
    await expect(
      service.recordPayment(actor, 'b', {
        paymentMethod: 'CASH',
        amount: '118.00',
        tenders: [
          { method: 'CASH', amount: '60.00' },
          { method: 'UPI', amount: '57.99' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('keeps each mixed-payment amount and its reference', async () => {
    const createPayment = jest.fn().mockRejectedValue(new PaymentConflictError());
    const { service } = setup(open, 'SUBMITTED', createPayment);
    await expect(
      service.recordPayment(actor, 'b', {
        paymentMethod: 'CASH',
        amount: '123.00',
        tipAmount: '5.00',
        tenders: [
          { method: 'CASH', amount: '50.00' },
          { method: 'UPI', amount: '73.00', referenceNumber: 'UPI-1' },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: 'UPI',
        tenders: [
          { method: 'CASH', amount: '50.00', referenceNumber: null },
          { method: 'UPI', amount: '73.00', referenceNumber: 'UPI-1' },
        ],
      }),
    );
  });

  it('blocks staff settlement once QR collection has started', async () => {
    const { service, createPayment } = setup(
      open,
      'SUBMITTED',
      jest.fn(),
      jest.fn().mockResolvedValue([{}]),
    );
    await expect(
      service.recordPayment(actor, 'b', { paymentMethod: 'CASH', amount: '118.00' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(createPayment).not.toHaveBeenCalled();
  });
});

describe('recordPaymentRequestSchema', () => {
  it('treats the reference as optional for every method', () => {
    for (const paymentMethod of ['CASH', 'CARD', 'UPI'])
      expect(recordPaymentRequestSchema.safeParse({ paymentMethod, amount: '1.00' }).success).toBe(
        true,
      );
  });

  it('rejects unknown methods', () => {
    expect(
      recordPaymentRequestSchema.safeParse({ paymentMethod: 'CHEQUE', amount: '1.00' }).success,
    ).toBe(false);
  });
});
