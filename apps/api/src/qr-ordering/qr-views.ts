import type {
  QrBillLine,
  QrCartLine,
  QrEditChange,
  QrGuestBill,
  QrGuestRound,
  QrQueueCard,
  QrShare,
} from '@rms/api-contract';
import { Prisma } from '@rms/db';
import { z } from 'zod';

import { computeTotals, lineSubtotal, type QrTotals, toTotalsDto } from './qr-billing';
import type { QrSessionView } from './qr-guest.repository';
import type { QrRoundCardRecord } from './qr-staff.repository';
import { firstName, roundDisplayStatus } from './qr-status';

const ZERO = new Prisma.Decimal(0);

const editLogSchema = z.array(
  z.object({
    name: z.string(),
    from: z.number().int(),
    to: z.number().int(),
    outOfStock: z.boolean(),
  }),
);
const claimedItemsSchema = z.array(
  z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().positive() }),
);

export function parseEditLog(value: Prisma.JsonValue | null): QrEditChange[] {
  const parsed = editLogSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseClaimedItems(
  value: Prisma.JsonValue | null,
): { orderItemId: string; quantity: number }[] | null {
  if (value === null) return null;
  const parsed = claimedItemsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function latest(dates: readonly (Date | null)[]): Date | null {
  return dates.reduce<Date | null>(
    (max, date) => (date && (!max || date > max) ? date : max),
    null,
  );
}

export function cartLines(
  session: QrSessionView,
  meId: string,
): { lines: QrCartLine[]; itemCount: number; subtotal: Prisma.Decimal } {
  const names = new Map(session.guests.map((guest) => [guest.id, guest.displayName]));
  const lines = session.cartItems.map((item) => {
    const unitPrice = item.menuItem.price;
    return {
      id: item.id,
      menuItemId: item.menuItemId,
      name: item.menuItem.name,
      isVeg: item.menuItem.isVeg,
      unitPrice: unitPrice.toFixed(2),
      quantity: item.quantity,
      lineTotal: unitPrice.mul(item.quantity).toFixed(2),
      specialInstructions: item.specialInstructions,
      available: item.menuItem.isAvailable && item.menuItem.isActive,
      addedBy: {
        id: item.addedByGuestId,
        name: names.get(item.addedByGuestId) ?? 'Guest',
        isMe: item.addedByGuestId === meId,
      },
    };
  });
  return {
    lines,
    itemCount: session.cartItems.reduce((count, item) => count + item.quantity, 0),
    subtotal: lineSubtotal(
      session.cartItems.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.menuItem.price,
      })),
    ),
  };
}

export function guestRound(
  round: QrSessionView['rounds'][number],
  gstRate: Prisma.Decimal,
  previousCaptainNames: ReadonlyMap<string, string>,
): QrGuestRound {
  const status = roundDisplayStatus(round, round.kots);
  // Before approval the guest's own quantities count; afterwards what the captain approved.
  const counted = round.items.filter((item) =>
    round.status === 'APPROVED' ? item.status === 'ACTIVE' : true,
  );
  const qty = (item: (typeof round.items)[number]): number =>
    round.status === 'APPROVED' ? item.quantity : item.requestedQuantity;
  const subtotal = lineSubtotal(
    counted.map((item) => ({ quantity: qty(item), unitPrice: item.unitPrice })),
  );
  const readyAt = ['ready', 'served'].includes(status)
    ? latest(round.kots.map((kot) => kot.guestNotifiedAt ?? kot.updatedAt))
    : null;
  return {
    id: round.id,
    number: round.roundNumber,
    status,
    captainName: round.owner ? firstName(round.owner.name) : null,
    previousCaptainName:
      round.reassignedFromUserId && round.status === 'AWAITING_APPROVAL'
        ? (previousCaptainNames.get(round.reassignedFromUserId) ?? null)
        : null,
    submittedAt: round.submittedAt.toISOString(),
    approvedAt: iso(round.approvedAt),
    rejectedAt: iso(round.rejectedAt),
    rejectReason: round.rejectReason,
    preparingAt: null,
    readyAt: iso(readyAt),
    servedAt: status === 'served' ? iso(latest(round.kots.map((kot) => kot.completedAt))) : null,
    edits: parseEditLog(round.editLog),
    editNote: round.editNote,
    itemCount: counted.reduce((count, item) => count + qty(item), 0),
    items: round.items.map((item) => ({
      id: item.id,
      name: item.menuItem.name,
      isVeg: item.menuItem.isVeg,
      quantity: item.quantity,
      requestedQuantity: item.requestedQuantity,
      unitPrice: item.unitPrice.toFixed(2),
      specialInstructions: item.specialInstructions,
      status: item.status,
      addedBy: item.addedBy.displayName,
    })),
    totals: toTotalsDto(computeTotals({ subtotal, gstRate })),
  };
}

export type BillComputation = {
  lines: QrBillLine[];
  totals: QrTotals;
  paid: Prisma.Decimal;
  remaining: Prisma.Decimal;
  settled: boolean;
};

/**
 * The table's bill from the staff order it feeds: same lines, rate and discount as the Billing
 * screen, so guest totals always equal the server-computed bill.
 */
export function computeSessionBill(
  session: QrSessionView,
  defaultGstRate: Prisma.Decimal,
): BillComputation {
  const order = session.order;
  const items = order?.items ?? [];
  const bill = order?.bill;
  const totals = computeTotals({
    subtotal: lineSubtotal(items),
    gstRate: bill && bill.status !== 'CANCELLED' ? bill.gstRate : defaultGstRate,
    discount: bill && bill.status === 'OPEN' ? bill.discountAmount : ZERO,
  });
  const paid = session.shares
    .filter((share) => share.status === 'PAID')
    .reduce((sum, share) => sum.plus(share.paidAmount ?? ZERO), ZERO);
  const remaining = Prisma.Decimal.max(totals.payable.minus(paid), ZERO);
  return {
    lines: items.map((item) => ({
      orderItemId: item.id,
      name: item.menuItem.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      lineTotal: item.unitPrice.mul(item.quantity).toFixed(2),
      addedBy: item.qrRoundItems[0]?.addedBy.displayName ?? null,
    })),
    totals,
    paid,
    remaining,
    settled: bill?.status === 'PAID' || session.status === 'CLOSED',
  };
}

export function shareDtos(session: QrSessionView, meId: string | null): QrShare[] {
  return session.shares.map((share) => ({
    id: share.id,
    label: share.label,
    guestId: share.guestId,
    isMine: meId !== null && share.guestId === meId,
    amount: share.amount.toFixed(2),
    status: share.status,
    requestedMethod: share.requestedMethod,
    paymentMethod: share.paymentMethod,
    paidAmount: share.paidAmount?.toFixed(2) ?? null,
    paidAt: iso(share.paidAt),
    claimedItems: parseClaimedItems(share.claimedItems),
  }));
}

export function guestBill(
  session: QrSessionView,
  defaultGstRate: Prisma.Decimal,
  meId: string,
): QrGuestBill | null {
  if (!session.order || session.order.items.length === 0) return null;
  const bill = computeSessionBill(session, defaultGstRate);
  return {
    roundCount: session.rounds.filter((round) => round.status === 'APPROVED').length,
    lines: bill.lines,
    totals: toTotalsDto(bill.totals),
    payable: bill.totals.payable.toFixed(2),
    paid: bill.paid.toFixed(2),
    remaining: bill.remaining.toFixed(2),
    splitMode: session.splitMode,
    shares: shareDtos(session, meId),
    settled: bill.settled,
  };
}

/** "Seekh Kebab ×2, Dal Makhani, Naan ×6…" */
export function itemsSummary(items: readonly { name: string; quantity: number }[]): string {
  const parts = items.map((item) =>
    item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name,
  );
  const shown = parts.slice(0, 3).join(', ');
  return parts.length > 3 ? `${shown}…` : shown;
}

export function queueCard(
  round: QrRoundCardRecord,
  gstRate: Prisma.Decimal,
  canAct: boolean,
): QrQueueCard {
  const status = roundDisplayStatus(round, round.kots);
  const counted = round.items.filter((item) =>
    round.status === 'APPROVED' ? item.status === 'ACTIVE' : true,
  );
  const qty = (item: (typeof round.items)[number]): number =>
    round.status === 'APPROVED' ? item.quantity : item.requestedQuantity;
  const subtotal = lineSubtotal(
    counted.map((item) => ({ quantity: qty(item), unitPrice: item.unitPrice })),
  );
  return {
    roundId: round.id,
    sessionId: round.sessionId,
    table: { id: round.table.id, number: round.table.tableNumber },
    roundNumber: round.roundNumber,
    status,
    guestCount: round.session._count.guests,
    itemCount: counted.reduce((count, item) => count + qty(item), 0),
    total: computeTotals({ subtotal, gstRate }).payable.toFixed(2),
    itemsSummary: itemsSummary(
      counted.map((item) => ({ name: item.menuItem.name, quantity: qty(item) })),
    ),
    submittedAt: round.submittedAt.toISOString(),
    escalateAt: iso(round.escalateAt),
    escalatedAt: iso(round.escalatedAt),
    onMyWayAt: iso(round.onMyWayAt),
    rejectedAt: iso(round.rejectedAt),
    rejectReason: round.rejectReason,
    captain: round.owner ? { id: round.owner.id, name: round.owner.name } : null,
    canAct,
  };
}
