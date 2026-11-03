import type { Bill } from '@rms/api-contract';

import type { BillRecord } from './bills.repository';

export function toBill(record: BillRecord): Bill {
  return {
    id: record.id,
    orderId: record.orderId,
    table: record.order.table,
    billNumber: record.billNumber,
    generatedByUserId: record.generatedByUserId,
    generatedAt: record.generatedAt.toISOString(),
    paidAt: record.paidAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
    status: record.status,
    subtotal: record.subtotal.toFixed(2),
    discountAmount: record.discountAmount.toFixed(2),
    gstRate: record.gstRate.toFixed(2),
    gstAmount: record.gstAmount.toFixed(2),
    totalAmount: record.totalAmount.toFixed(2),
    cancellationReason: record.cancellationReason,
    currency: record.restaurant.currency,
    timezone: record.restaurant.timezone,
    maxDiscountPercent: record.restaurant.maxDiscountPercent.toFixed(2),
    lines: record.order.items.map((line) => ({
      id: line.id,
      name: line.menuItem.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice.toFixed(2),
      amount: line.unitPrice.mul(line.quantity).toFixed(2),
    })),
  };
}
