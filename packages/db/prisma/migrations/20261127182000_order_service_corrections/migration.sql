ALTER TABLE "orders"
  ADD COLUMN "seated_reservation_on_open" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "discarded_by_user_id" UUID,
  ADD COLUMN "discard_reason" VARCHAR(255);

ALTER TABLE "kots" ADD COLUMN "correction_of" VARCHAR(50);

ALTER TABLE "kot_items"
  ADD COLUMN "voided_at" TIMESTAMPTZ(6),
  ADD COLUMN "voided_by_user_id" UUID,
  ADD COLUMN "void_reason" VARCHAR(255);

ALTER TABLE "orders" ADD CONSTRAINT "orders_discarded_by_user_id_fkey"
  FOREIGN KEY ("discarded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kot_items" ADD CONSTRAINT "kot_items_voided_by_user_id_fkey"
  FOREIGN KEY ("voided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "role_permissions" ("role_id", "permission_key")
  SELECT "id", 'order:void-item' FROM "roles"
  WHERE "name" = 'MANAGER' AND "is_system" AND NOT "is_owner"
ON CONFLICT DO NOTHING;
