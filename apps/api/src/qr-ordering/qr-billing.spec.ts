import { Prisma } from '@rms/db';

import {
  claimedUnits,
  computeTotals,
  dominantMethod,
  itemShareAmount,
  lineSubtotal,
  splitEqually,
} from './qr-billing';

const d = (value: string | number): Prisma.Decimal => new Prisma.Decimal(value);

describe('QR bill maths', () => {
  it('matches the designed bill: 5% GST as CGST/SGST halves plus a round-off line', () => {
    const totals = computeTotals({ subtotal: d('1870'), gstRate: d('5') });
    expect(totals.cgst.toFixed(2)).toBe('46.75');
    expect(totals.sgst.toFixed(2)).toBe('46.75');
    expect(totals.exactTotal.toFixed(2)).toBe('1963.50');
    expect(totals.roundOff.toFixed(2)).toBe('0.50');
    expect(totals.payable.toFixed(2)).toBe('1964.00');
  });

  it('rounds down below half a rupee and keeps CGST + SGST equal to the GST', () => {
    const totals = computeTotals({ subtotal: d('101'), gstRate: d('5') });
    // GST 5.05 → CGST 2.53 (half up) + SGST 2.52
    expect(totals.cgst.plus(totals.sgst).toFixed(2)).toBe('5.05');
    expect(totals.payable.toFixed(2)).toBe('106.00');
    expect(totals.roundOff.toFixed(2)).toBe('-0.05');
  });

  it('applies GST after a discount, like the staff bill', () => {
    const totals = computeTotals({ subtotal: d('1000'), gstRate: d('5'), discount: d('100') });
    expect(totals.cgst.plus(totals.sgst).toFixed(2)).toBe('45.00');
    expect(totals.payable.toFixed(2)).toBe('945.00');
  });

  it('sums line subtotals from snapshot prices', () => {
    expect(
      lineSubtotal([
        { quantity: 2, unitPrice: d('110') },
        { quantity: 1, unitPrice: d('450') },
      ]).toFixed(2),
    ).toBe('670.00');
  });

  it('splits equally in whole rupees that always add up to the total', () => {
    expect(splitEqually(d('1964'), 4).map(String)).toEqual(['491', '491', '491', '491']);
    const uneven = splitEqually(d('1000'), 3);
    expect(uneven.map(String)).toEqual(['334', '333', '333']);
    expect(uneven.reduce((sum, share) => sum.plus(share), d(0)).toString()).toBe('1000');
    expect(() => splitEqually(d('10'), 0)).toThrow(RangeError);
  });

  it('scales a by-item share so it carries its part of GST and round-off', () => {
    const totals = computeTotals({ subtotal: d('1000'), gstRate: d('5') });
    expect(itemShareAmount(d('500'), totals).toString()).toBe('525');
    expect(itemShareAmount(d('0'), totals).toString()).toBe('0');
  });

  it('counts units already claimed by other shares', () => {
    const claimed = claimedUnits([
      { claimedItems: [{ orderItemId: 'a', quantity: 2 }] },
      {
        claimedItems: [
          { orderItemId: 'a', quantity: 1 },
          { orderItemId: 'b', quantity: 1 },
        ],
      },
      { claimedItems: null },
    ]);
    expect(claimed.get('a')).toBe(3);
    expect(claimed.get('b')).toBe(1);
  });

  it('settles a mixed split with the method that covered the most money', () => {
    expect(
      dominantMethod([
        { method: 'UPI', amount: d('491') },
        { method: 'CASH', amount: d('600') },
        { method: 'UPI', amount: d('491') },
      ]),
    ).toBe('UPI');
    expect(dominantMethod([])).toBeNull();
  });
});
