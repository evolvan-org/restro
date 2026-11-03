import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { recordPaymentRequestSchema } from '@rms/api-contract';
import { Prisma } from '@rms/db';

import type { Actor } from '../common/auth/authenticated-request';
import { type BillsRepository, PaymentConflictError } from './bills.repository';
import { BillsService } from './bills.service';

const actor = { userId: 'u1', restaurantId: 'r1', role: 'CASHIER' } as unknown as Actor;
const D = (v: string): Prisma.Decimal => new Prisma.Decimal(v);

function setup(
  bill: { status: string; totalAmount: Prisma.Decimal } | null,
  orderStatus = 'SUBMITTED',
  settle = jest.fn(),
) {
  const repository = {
    withLockedOrder: (_r: string, _t: unknown, run: (c: unknown) => unknown) =>
      run({ bill, order: { status: orderStatus }, settle }),
  } as unknown as BillsRepository;
  return { service: new BillsService(repository), settle };
}

describe('BillsService.recordPayment', () => {
  const open = { status: 'OPEN', totalAmount: D('118.00') };

  it('404s for an unknown bill', async () => {
    await expect(
      setup(null).service.recordPayment(actor, 'b', { paymentMethod: 'CASH', amount: '118.00' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['PAID', 'CANCELLED'])('409s for a %s bill', async (status) => {
    const { service, settle } = setup({ ...open, status });
    await expect(
      service.recordPayment(actor, 'b', { paymentMethod: 'CASH', amount: '118.00' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(settle).not.toHaveBeenCalled();
  });

  it('400s when amount differs from the total', async () => {
    const { service, settle } = setup(open);
    await expect(
      service.recordPayment(actor, 'b', { paymentMethod: 'CASH', amount: '100.00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(settle).not.toHaveBeenCalled();
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
    const settle = jest.fn().mockRejectedValue(new PaymentConflictError());
    const { service } = setup(open, 'SUBMITTED', settle);
    await service
      .recordPayment(actor, 'b', { paymentMethod: 'CASH', amount: '118.00', referenceNumber: 'x' })
      .catch(() => undefined);
    await service
      .recordPayment(actor, 'b', { paymentMethod: 'UPI', amount: '118.00', referenceNumber: 'x' })
      .catch(() => undefined);
    expect(settle.mock.calls[0][0]).toMatchObject({
      referenceNumber: null,
      recordedByUserId: 'u1',
    });
    expect(settle.mock.calls[1][0]).toMatchObject({ referenceNumber: 'x' });
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
