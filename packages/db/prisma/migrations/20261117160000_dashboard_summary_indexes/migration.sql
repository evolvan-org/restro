-- Support the tenant- and local-day-bounded aggregates polled by the dashboard.
CREATE INDEX "orders_restaurant_id_created_at_idx"
ON "orders"("restaurant_id", "created_at");

CREATE INDEX "orders_restaurant_id_status_completed_at_idx"
ON "orders"("restaurant_id", "status", "completed_at");

CREATE INDEX "bills_restaurant_id_status_paid_at_idx"
ON "bills"("restaurant_id", "status", "paid_at");
