import { Prisma } from '@rms/db';

type Decimal = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);

export type QrTotals = {
  subtotal: Decimal;
  discount: Decimal;
  gstRate: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  /** Total before rounding: subtotal − discount + GST (what the staff bill stores). */
  exactTotal: Decimal;
  /** Signed rounding to the nearest rupee. */
  roundOff: Decimal;
  /** What guests pay: `exactTotal` rounded to the nearest rupee (half up). */
  payable: Decimal;
};

export function money(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function lineSubtotal(lines: readonly { quantity: number; unitPrice: Decimal }[]): Decimal {
  return lines.reduce((sum, line) => sum.plus(line.unitPrice.mul(line.quantity)), ZERO);
}

/**
 * Same arithmetic as the staff bill (`calculateBill`): GST on (subtotal − discount), rounded to
 * paise, shown as equal CGST and SGST halves; then a round-off line to the nearest rupee.
 */
export function computeTotals(input: {
  subtotal: Decimal;
  gstRate: Decimal;
  discount?: Decimal;
}): QrTotals {
  const subtotal = money(input.subtotal);
  const discount = money(input.discount ?? ZERO);
  const base = subtotal.minus(discount);
  const gst = money(base.mul(input.gstRate).div(100));
  const cgst = money(gst.div(2));
  const sgst = gst.minus(cgst);
  const exactTotal = base.plus(gst);
  const payable = exactTotal.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  return {
    subtotal,
    discount,
    gstRate: input.gstRate,
    cgst,
    sgst,
    exactTotal,
    roundOff: payable.minus(exactTotal),
    payable,
  };
}

/** Wire shape for `qrMoneyTotalsSchema`; `total` is the rounded payable amount. */
export function toTotalsDto(totals: QrTotals): {
  subtotal: string;
  discount: string;
  gstRate: string;
  cgst: string;
  sgst: string;
  roundOff: string;
  total: string;
} {
  return {
    subtotal: totals.subtotal.toFixed(2),
    discount: totals.discount.toFixed(2),
    gstRate: totals.gstRate.toFixed(2),
    cgst: totals.cgst.toFixed(2),
    sgst: totals.sgst.toFixed(2),
    roundOff: totals.roundOff.toFixed(2),
    total: totals.payable.toFixed(2),
  };
}

/**
 * Splits a whole-rupee amount into `people` whole-rupee shares that add up exactly: everyone pays
 * the floor and the first shares carry one extra rupee each for the remainder.
 */
export function splitEqually(payable: Decimal, people: number): Decimal[] {
  if (!Number.isInteger(people) || people < 1) throw new RangeError('people must be ≥ 1');
  const rupees = payable.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  const base = rupees.div(people).floor();
  const remainder = rupees.minus(base.mul(people)).toNumber();
  return Array.from({ length: people }, (_, index) => (index < remainder ? base.plus(1) : base));
}

/**
 * A by-item share: the claimed lines' subtotal scaled by payable/subtotal so it carries its part of
 * GST, discount and round-off; rounded to the rupee (half up).
 */
export function itemShareAmount(claimedSubtotal: Decimal, totals: QrTotals): Decimal {
  if (totals.subtotal.isZero()) return ZERO;
  return claimedSubtotal
    .mul(totals.payable)
    .div(totals.subtotal)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

/** How many units of each order line are already claimed by other shares. */
export function claimedUnits(
  shares: readonly { claimedItems: readonly { orderItemId: string; quantity: number }[] | null }[],
): Map<string, number> {
  const claimed = new Map<string, number>();
  for (const share of shares) {
    for (const item of share.claimedItems ?? []) {
      claimed.set(item.orderItemId, (claimed.get(item.orderItemId) ?? 0) + item.quantity);
    }
  }
  return claimed;
}

/**
 * The settlement payment method for the staff bill: the method that covered the most money
 * (ties go to the first one recorded). The bill's single payment row cannot hold a mix.
 */
export function dominantMethod<TMethod extends string>(
  payments: readonly { method: TMethod; amount: Decimal }[],
): TMethod | null {
  const totals = new Map<TMethod, Decimal>();
  for (const payment of payments) {
    totals.set(payment.method, (totals.get(payment.method) ?? ZERO).plus(payment.amount));
  }
  let best: TMethod | null = null;
  let bestAmount = ZERO;
  for (const [method, amount] of totals) {
    if (best === null || amount.gt(bestAmount)) {
      best = method;
      bestAmount = amount;
    }
  }
  return best;
}
