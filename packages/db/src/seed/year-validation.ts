import { addMinutes, localTime, type Tx } from './support';
import { YEAR_DAYS } from './year-config';

export async function validateYearSeed(tx: Tx, restaurantId: string, anchor: Date) {
  const historicalUntil = addMinutes(anchor, -150);
  const [coverage] = await tx.$queryRaw<
    { days: number; startsEarly: boolean; endsRecently: boolean }[]
  >`
    SELECT count(DISTINCT (reservation_at AT TIME ZONE 'Asia/Kolkata')::date)::int AS days,
      coalesce(min(reservation_at) < ${localTime(-YEAR_DAYS + 7, 0, 0, anchor)}, false) AS "startsEarly",
      coalesce(max(reservation_at) >= ${localTime(-7, 0, 0, anchor)}, false) AS "endsRecently"
    FROM reservations WHERE restaurant_id = ${restaurantId}::uuid AND reservation_at < ${historicalUntil}
      AND status = 'COMPLETED'`;
  if (!coverage || coverage.days < 320 || !coverage.startsEarly || !coverage.endsRecently)
    throw new Error('Seed validation failed: insufficient service history across the year');

  const failures = await tx.$queryRaw<{ check: string; failures: number }[]>`
    WITH
    target AS (SELECT ${restaurantId}::uuid AS id),
    r AS (SELECT * FROM reservations WHERE restaurant_id = (SELECT id FROM target)),
    o AS (SELECT * FROM orders WHERE restaurant_id = (SELECT id FROM target)),
    k AS (SELECT * FROM kots WHERE restaurant_id = (SELECT id FROM target)),
    b AS (SELECT * FROM bills WHERE restaurant_id = (SELECT id FROM target)),
    p AS (
      SELECT p.* FROM payments p JOIN b ON b.id = p.bill_id WHERE p.status = 'COMPLETED'
    ),
    subtotals AS (
      SELECT i.order_id, sum(i.quantity * i.unit_price) AS subtotal
      FROM order_items i JOIN o ON o.id = i.order_id WHERE i.status = 'ACTIVE' GROUP BY i.order_id
    ),
    scheduled AS (
      SELECT * FROM r WHERE status IN ('BOOKED', 'SEATED', 'COMPLETED')
    ),
    kot_sequence AS (
      SELECT created_at,
        lag(created_at) OVER (ORDER BY substring(kot_number FROM 5)::bigint) AS previous
      FROM k WHERE kot_number ~ '^KOT-[0-9]+$'
    ),
    bill_sequence AS (
      SELECT generated_at, split_part(bill_number, '-', 2)::int AS fy,
        (extract(year FROM (generated_at AT TIME ZONE 'Asia/Kolkata') - interval '3 months'))::int AS expected_fy,
        lag(generated_at) OVER (
          PARTITION BY split_part(bill_number, '-', 2) ORDER BY split_part(bill_number, '-', 3)::bigint
        ) AS previous
      FROM b WHERE bill_number ~ '^INV-[0-9]{4}-[0-9]+$'
    ),
    stock AS (SELECT * FROM stock_items WHERE restaurant_id = (SELECT id FROM target)),
    movements AS (
      SELECT stock_item_id, sum(quantity) AS balance FROM stock_movements
      WHERE restaurant_id = (SELECT id FROM target) GROUP BY stock_item_id
    ),
    lots AS (
      SELECT stock_item_id, sum(quantity_remaining) AS balance,
        bool_or(quantity_remaining < 0 OR quantity_remaining > quantity_received) AS invalid
      FROM stock_batches WHERE restaurant_id = (SELECT id FROM target) GROUP BY stock_item_id
    ),
    purchasing AS (
      SELECT po.id, po.status, bool_and(pol.quantity = pol.quantity_received) AS complete,
        bool_or(pol.quantity_received > pol.quantity OR pol.quantity_received < 0) AS invalid
      FROM inventory_purchase_orders po JOIN inventory_purchase_order_lines pol ON pol.purchase_order_id = po.id
      WHERE po.restaurant_id = (SELECT id FROM target) GROUP BY po.id
    ),
    checks AS (
      SELECT 'reservation links/times' AS check, count(*)::int AS failures FROM r
      JOIN guests g ON g.id = r.guest_id
      LEFT JOIN restaurant_tables t ON t.id = r.table_id
      WHERE g.restaurant_id <> r.restaurant_id OR t.restaurant_id <> r.restaurant_id
        OR r.party_size > t.capacity OR r.created_at > r.reservation_at
        OR r.created_at > r.updated_at OR r.created_at < g.created_at
      UNION ALL
      SELECT 'schedule conflicts', count(*)::int FROM scheduled a JOIN scheduled c
        ON (a.table_id = c.table_id OR a.captain_user_id = c.captain_user_id)
        AND a.id < c.id AND abs(extract(epoch FROM a.reservation_at - c.reservation_at)) < 5400
      UNION ALL
      SELECT 'order links/times', count(*)::int FROM o
      LEFT JOIN r ON r.id = o.reservation_id
      JOIN restaurant_tables t ON t.id = o.table_id
      WHERE t.restaurant_id <> o.restaurant_id
        OR (o.reservation_id IS NOT NULL AND (r.id IS NULL OR o.table_id IS DISTINCT FROM r.table_id))
        OR o.opened_at < r.reservation_at OR o.completed_at < o.opened_at OR o.updated_at < o.created_at
      UNION ALL
      SELECT 'KOT links/times', count(*)::int FROM k LEFT JOIN o ON o.id = k.order_id
      WHERE o.id IS NULL OR k.created_at < o.opened_at OR k.completed_at < k.created_at
        OR k.completed_at > o.completed_at
      UNION ALL
      SELECT 'KOT item links/times', count(*)::int FROM k JOIN kot_items ki ON ki.kot_id = k.id
      JOIN order_items i ON i.id = ki.order_item_id
      WHERE i.order_id <> k.order_id OR ki.quantity <> i.quantity OR ki.created_at < i.created_at
      UNION ALL
      SELECT 'bill arithmetic or lifecycle', count(*)::int FROM b
      LEFT JOIN o ON o.id = b.order_id LEFT JOIN subtotals s ON s.order_id = b.order_id
      JOIN restaurants tenant ON tenant.id = b.restaurant_id
      WHERE o.id IS NULL OR b.generated_at < o.opened_at OR b.paid_at < b.generated_at
        OR b.subtotal <> coalesce(s.subtotal, 0) OR b.discount_amount < 0
        OR b.discount_amount > round(b.subtotal * tenant.max_discount_percent / 100, 2)
        OR b.gst_amount <> round((b.subtotal - b.discount_amount) * b.gst_rate / 100, 2)
        OR b.total_amount <> b.subtotal - b.discount_amount + b.gst_amount
        OR (b.status = 'CANCELLED' AND NOT EXISTS (
          SELECT 1 FROM bill_cancellation_reasons cr
          WHERE cr.restaurant_id = b.restaurant_id AND cr.name = b.cancellation_reason))
      UNION ALL
      SELECT 'settlement', count(*)::int FROM b LEFT JOIN p ON p.bill_id = b.id
      WHERE (b.status = 'PAID' AND (p.id IS NULL OR p.amount <> b.total_amount
        OR p.paid_at IS NULL OR b.paid_at IS DISTINCT FROM p.paid_at))
        OR (b.status <> 'PAID' AND (p.id IS NOT NULL OR b.paid_at IS NOT NULL))
      UNION ALL
      SELECT 'duplicate settlements', count(*)::int FROM (SELECT bill_id FROM p GROUP BY bill_id HAVING count(*) > 1) duplicates
      UNION ALL
      SELECT 'KOT sequence', count(*)::int FROM kot_sequence WHERE created_at < previous
      UNION ALL
      SELECT 'bill sequence', count(*)::int FROM bill_sequence WHERE generated_at < previous OR fy <> expected_fy
      UNION ALL
      SELECT 'stock balances', count(*)::int FROM stock s
      LEFT JOIN movements m ON m.stock_item_id = s.id LEFT JOIN lots l ON l.stock_item_id = s.id
      WHERE s.current_stock < 0 OR s.current_stock <> coalesce(m.balance, 0)
        OR s.current_stock <> coalesce(l.balance, 0) OR l.invalid
      UNION ALL
      SELECT 'purchase order status or quantity', count(*)::int FROM purchasing
      WHERE invalid OR ((status = 'RECEIVED') IS DISTINCT FROM complete)
      UNION ALL
      SELECT 'notification links/times', count(*)::int FROM notifications n
      JOIN users u ON u.id = n.recipient_user_id
      LEFT JOIN o ON n.entity::text = 'order' AND o.id = n.entity_id
      LEFT JOIN r ON n.entity::text = 'reservation' AND r.id = n.entity_id
      WHERE n.restaurant_id = (SELECT id FROM target)
        AND (u.restaurant_id <> n.restaurant_id OR n.read_at < n.created_at
          OR (n.entity::text = 'order' AND o.id IS NULL)
          OR (n.entity::text = 'reservation' AND r.id IS NULL))
    )
    SELECT * FROM checks WHERE failures > 0`;
  if (failures.length) throw new Error(`Seed validation failed: ${JSON.stringify(failures)}`);

  const [counts] = await tx.$queryRaw<Record<string, number>[]>`
    WITH target AS (SELECT ${restaurantId}::uuid AS id)
    SELECT
      (SELECT count(*)::int FROM guests WHERE restaurant_id = target.id) AS guests,
      (SELECT count(*)::int FROM reservations WHERE restaurant_id = target.id) AS reservations,
      (SELECT count(*)::int FROM orders WHERE restaurant_id = target.id) AS orders,
      (SELECT count(*)::int FROM kots WHERE restaurant_id = target.id) AS kots,
      (SELECT count(*)::int FROM bills WHERE restaurant_id = target.id) AS bills,
      (SELECT count(*)::int FROM payments p JOIN bills b ON b.id = p.bill_id WHERE b.restaurant_id = target.id) AS payments,
      (SELECT count(*)::int FROM inventory_purchase_orders WHERE restaurant_id = target.id) AS "purchase orders",
      (SELECT count(*)::int FROM inventory_receipts WHERE restaurant_id = target.id) AS receipts,
      (SELECT count(*)::int FROM stock_movements WHERE restaurant_id = target.id) AS "stock movements",
      (SELECT count(*)::int FROM notifications WHERE restaurant_id = target.id) AS notifications
    FROM target`;
  return { 'service days': coverage.days, ...counts };
}

export async function analyzeYearSeed(tx: Tx): Promise<void> {
  await tx.$executeRaw`ANALYZE guests, reservations, orders, order_items, kots, kot_items,
    bills, payments, inventory_purchase_orders, inventory_purchase_order_lines, inventory_receipts,
    inventory_receipt_lines, stock_items, stock_batches, stock_movements, notifications`;
}
