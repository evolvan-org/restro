import { Prisma } from '@rms/db';

import { setTableLifecycleStatus } from './table-lifecycle';

/**
 * Completes an OPEN/SUBMITTED order, finishes its seated reservation and moves its table to
 * NEEDS_CLEANING. Shared by manual order completion and payment settlement.
 * Locks table, reservation and order rows; returns false if the order is missing or not active.
 */
export async function completeOrderInTx(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  orderId: string,
): Promise<boolean> {
  const candidate = await tx.order.findFirst({
    where: { id: orderId, restaurantId },
    select: { tableId: true, reservationId: true },
  });
  if (!candidate) return false;

  if (candidate.reservationId) {
    await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${candidate.reservationId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
  }
  await tx.$queryRaw`SELECT id FROM restaurant_tables WHERE id = ${candidate.tableId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
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
