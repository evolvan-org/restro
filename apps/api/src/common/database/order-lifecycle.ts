import { Prisma } from '@rms/db';

import { setTableLifecycleStatus } from './table-lifecycle';

export type LockedOrderLifecycle = { id: string; tableId: string; reservationId: string | null };

/** Acquire lifecycle locks before any order/bill lock. Order table/reservation links are immutable. */
export async function lockOrderLifecycle(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  orderId: string,
): Promise<LockedOrderLifecycle | null> {
  const candidate = await tx.order.findFirst({
    where: { id: orderId, restaurantId },
    select: { id: true, tableId: true, reservationId: true },
  });
  if (!candidate) return null;
  if (candidate.reservationId) {
    await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${candidate.reservationId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
  }
  await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${candidate.tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
  return tx.order.findFirst({
    where: {
      id: orderId,
      restaurantId,
      tableId: candidate.tableId,
      reservationId: candidate.reservationId,
    },
    select: { id: true, tableId: true, reservationId: true },
  });
}

/** Called only after lockOrderLifecycle, in the same payment transaction. */
export async function completeOrderInTx(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  lockedOrder: LockedOrderLifecycle,
): Promise<boolean> {
  const orderId = lockedOrder.id;
  const order = await tx.order.findFirst({
    where: { id: orderId, restaurantId },
    select: { id: true, tableId: true, reservationId: true, status: true },
  });
  if (!order || !['OPEN', 'SUBMITTED'].includes(order.status)) return false;

  await tx.order.update({
    where: { id: order.id, restaurantId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  if (order.reservationId) {
    await tx.reservation.updateMany({
      where: { id: order.reservationId, restaurantId, status: 'SEATED' },
      data: { status: 'COMPLETED' },
    });
  }
  // Closure must never block settlement: skip when the status isn't configured.
  const cleaning = await tx.tableStatus.findFirst({
    where: { restaurantId, code: 'NEEDS_CLEANING', isActive: true },
    select: { id: true },
  });
  if (cleaning) await setTableLifecycleStatus(tx, restaurantId, order.tableId, 'NEEDS_CLEANING');
  return true;
}
