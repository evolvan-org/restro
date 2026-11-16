import type { Prisma } from '@rms/db';

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
