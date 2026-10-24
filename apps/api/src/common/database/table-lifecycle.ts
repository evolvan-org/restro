import { Prisma } from '@rms/db';
import { RESERVATION_DURATION_MINUTES } from '@rms/shared';

type DatabaseClient = Prisma.TransactionClient;

export async function setTableLifecycleStatus(
  db: DatabaseClient,
  restaurantId: string,
  tableId: string,
  statusCode: 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'NEEDS_CLEANING',
): Promise<void> {
  const status = await db.tableStatus.findFirst({
    where: { restaurantId, code: statusCode, isActive: true },
    select: { id: true },
  });
  if (!status) throw new Error(`Active table status ${statusCode} is not configured`);

  const table = await db.restaurantTable.findFirst({
    where: { id: tableId, restaurantId },
    select: { currentStatusId: true },
  });
  if (!table || table.currentStatusId === status.id) return;

  await db.restaurantTable.update({
    where: { id: tableId, restaurantId },
    data: { currentStatusId: status.id, statusChangedAt: new Date() },
  });
}

export async function reconcileRestaurantTableStatuses(
  db: DatabaseClient,
  restaurantId: string,
): Promise<void> {
  await db.$executeRaw`
    WITH desired AS (
      SELECT rt.id,
        CASE
          WHEN current_status.code = 'NEEDS_CLEANING' THEN 'NEEDS_CLEANING'
          WHEN EXISTS (
            SELECT 1 FROM orders o
            WHERE o.table_id = rt.id AND o.restaurant_id = ${restaurantId}::uuid
              AND o.status IN ('OPEN', 'SUBMITTED')
          ) OR EXISTS (
            SELECT 1 FROM reservations r
            WHERE r.table_id = rt.id AND r.restaurant_id = ${restaurantId}::uuid
              AND r.status = 'SEATED'
          ) THEN 'OCCUPIED'
          WHEN EXISTS (
            SELECT 1 FROM reservations r
            WHERE r.table_id = rt.id AND r.restaurant_id = ${restaurantId}::uuid
              AND r.status = 'BOOKED'
              AND r.reservation_at <= NOW() + (${RESERVATION_DURATION_MINUTES} * INTERVAL '1 minute')
          ) THEN 'RESERVED'
          WHEN current_status.code IN ('RESERVED', 'OCCUPIED') THEN 'AVAILABLE'
          ELSE current_status.code
        END AS status_code
      FROM restaurant_tables rt
      JOIN table_statuses current_status ON current_status.id = rt.current_status_id
      WHERE rt.restaurant_id = ${restaurantId}::uuid AND rt.is_active = true
    )
    UPDATE restaurant_tables rt
    SET current_status_id = target.id, status_changed_at = NOW(), updated_at = NOW()
    FROM desired
    JOIN table_statuses target
      ON target.restaurant_id = ${restaurantId}::uuid
      AND target.code = desired.status_code
      AND target.is_active = true
    WHERE rt.id = desired.id AND rt.current_status_id <> target.id
  `;
}

export async function reconcileTableStatus(
  db: DatabaseClient,
  restaurantId: string,
  tableId: string,
): Promise<void> {
  const table = await db.restaurantTable.findFirst({
    where: { id: tableId, restaurantId },
    select: { currentStatus: { select: { code: true } } },
  });
  if (!table || table.currentStatus.code === 'NEEDS_CLEANING') return;

  const reservationWindowEnd = new Date(Date.now() + RESERVATION_DURATION_MINUTES * 60_000);
  const [activeOrder, seatedReservation, protectedReservation] = await Promise.all([
    db.order.findFirst({
      where: { restaurantId, tableId, status: { in: ['OPEN', 'SUBMITTED'] } },
      select: { id: true },
    }),
    db.reservation.findFirst({
      where: { restaurantId, tableId, status: 'SEATED' },
      select: { id: true },
    }),
    db.reservation.findFirst({
      where: {
        restaurantId,
        tableId,
        status: 'BOOKED',
        reservationAt: { lte: reservationWindowEnd },
      },
      select: { id: true },
    }),
  ]);

  await setTableLifecycleStatus(
    db,
    restaurantId,
    tableId,
    activeOrder || seatedReservation ? 'OCCUPIED' : protectedReservation ? 'RESERVED' : 'AVAILABLE',
  );
}
