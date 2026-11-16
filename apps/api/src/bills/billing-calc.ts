import { BadRequestException } from '@nestjs/common';
import type { UpdateBillRequest } from '@rms/api-contract';
import { Prisma } from '@rms/db';

const MAX_MONEY = new Prisma.Decimal('9999999999.99');

export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function billingSubtotal(
  lines: readonly { quantity: number; unitPrice: Prisma.Decimal }[],
): Prisma.Decimal {
  return checkedMoney(
    lines.reduce((sum, line) => sum.plus(line.unitPrice.mul(line.quantity)), new Prisma.Decimal(0)),
  );
}

export function calculateBill(input: {
  subtotal: Prisma.Decimal;
  gstRate: Prisma.Decimal;
  savedDiscount: Prisma.Decimal;
  maxDiscountPercent: Prisma.Decimal;
  discount?: UpdateBillRequest['discount'];
}): {
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  gstAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
} {
  const { subtotal, gstRate, maxDiscountPercent, discount } = input;
  const value = discount ? new Prisma.Decimal(discount.value) : input.savedDiscount;
  if (discount?.type === 'PERCENT' && value.gt(100)) {
    throw new BadRequestException('Discount percentage cannot exceed 100');
  }
  const discountAmount = roundMoney(
    discount?.type === 'PERCENT' ? subtotal.mul(value).div(100) : value,
  );
  if (
    discountAmount.gt(subtotal) ||
    discountAmount.gt(roundMoney(subtotal.mul(maxDiscountPercent).div(100)))
  ) {
    throw new BadRequestException('Discount exceeds the subtotal or restaurant discount cap');
  }
  const base = subtotal.minus(discountAmount);
  const gstAmount = checkedMoney(roundMoney(base.mul(gstRate).div(100)));
  return {
    subtotal: checkedMoney(subtotal),
    discountAmount: checkedMoney(discountAmount),
    gstAmount,
    totalAmount: checkedMoney(base.plus(gstAmount)),
  };
}

function checkedMoney(value: Prisma.Decimal): Prisma.Decimal {
  if (!value.isFinite() || value.isNegative() || value.gt(MAX_MONEY)) {
    throw new BadRequestException('Bill amount is outside the supported range');
  }
  return value;
}

export function financialYear(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return month >= 4 ? year : year - 1;
}
