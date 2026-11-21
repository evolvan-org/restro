-- REST-79: roles & permissions management.
-- Idempotent: safe to re-run. Reverse: drop roles.is_owner (+ its index) and re-grant
-- restaurant:read to roles holding floor:read/settings:read; the Cashier role is not restored.

-- 1. Owner flag: one bypass role per restaurant, no permission rows.
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "is_owner" BOOLEAN NOT NULL DEFAULT false;
UPDATE "roles" SET "is_owner" = true WHERE "name" = 'OWNER';
DELETE FROM "role_permissions" WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "is_owner");
-- Raw SQL: Prisma cannot express a partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS "roles_one_owner_per_restaurant"
  ON "roles" ("restaurant_id") WHERE "is_owner";

-- 2. Split restaurant:read so no role loses access, then drop it.
INSERT INTO "role_permissions" ("role_id", "permission_key")
  SELECT "role_id", k.key FROM "role_permissions"
  CROSS JOIN (VALUES ('floor:read'), ('settings:read')) AS k(key)
  WHERE "permission_key" = 'restaurant:read'
ON CONFLICT DO NOTHING;
DELETE FROM "role_permissions" WHERE "permission_key" = 'restaurant:read';

-- 3. Cashier → Reception: create Reception where missing, move users, delete Cashier.
INSERT INTO "roles" ("id", "restaurant_id", "name", "is_system", "is_owner", "updated_at")
  SELECT gen_random_uuid(), r."id", 'RECEPTION', true, false, CURRENT_TIMESTAMP
  FROM "restaurants" r
ON CONFLICT ("restaurant_id", "name") DO NOTHING;
UPDATE "users" u SET "role_id" = rec."id"
  FROM "roles" c JOIN "roles" rec ON rec."restaurant_id" = c."restaurant_id" AND rec."name" = 'RECEPTION'
  WHERE c."name" = 'CASHIER' AND u."role_id" = c."id";
DELETE FROM "roles" WHERE "name" = 'CASHIER';

-- 4. Reset default roles to the new matrix (backfills Reception and role:*, trims Captain).
DELETE FROM "role_permissions" WHERE "role_id" IN (
  SELECT "id" FROM "roles"
  WHERE "name" IN ('MANAGER', 'CAPTAIN', 'RECEPTION', 'KITCHEN_STAFF', 'BAR_STAFF'));
INSERT INTO "role_permissions" ("role_id", "permission_key")
  SELECT r."id", d.permission
  FROM "roles" r
  JOIN (VALUES
    ('MANAGER', 'dashboard:read'),
    ('MANAGER', 'report:read'),
    ('MANAGER', 'user:read'),
    ('MANAGER', 'user:write'),
    ('MANAGER', 'role:read'),
    ('MANAGER', 'role:write'),
    ('MANAGER', 'floor:read'),
    ('MANAGER', 'settings:read'),
    ('MANAGER', 'restaurant:write'),
    ('MANAGER', 'table:update-status'),
    ('MANAGER', 'table:assign-captain'),
    ('MANAGER', 'menu:read'),
    ('MANAGER', 'menu:write'),
    ('MANAGER', 'stock:read'),
    ('MANAGER', 'inventory:manage'),
    ('MANAGER', 'reservation:read'),
    ('MANAGER', 'reservation:write'),
    ('MANAGER', 'reservation:assign-table'),
    ('MANAGER', 'order:read'),
    ('MANAGER', 'order:write'),
    ('MANAGER', 'order:update'),
    ('MANAGER', 'kot:read'),
    ('MANAGER', 'kot:write'),
    ('MANAGER', 'kot:update-status'),
    ('MANAGER', 'bill:read'),
    ('MANAGER', 'bill:write'),
    ('MANAGER', 'bill:generate'),
    ('MANAGER', 'bill:update'),
    ('MANAGER', 'bill:cancel'),
    ('MANAGER', 'bill:discount'),
    ('MANAGER', 'payment:read'),
    ('MANAGER', 'payment:write'),
    ('CAPTAIN', 'dashboard:read'),
    ('CAPTAIN', 'menu:read'),
    ('CAPTAIN', 'floor:read'),
    ('CAPTAIN', 'table:update-status'),
    ('CAPTAIN', 'reservation:read'),
    ('CAPTAIN', 'reservation:write'),
    ('CAPTAIN', 'reservation:assign-table'),
    ('CAPTAIN', 'table:be-captain'),
    ('CAPTAIN', 'order:read'),
    ('CAPTAIN', 'order:write'),
    ('CAPTAIN', 'order:update'),
    ('CAPTAIN', 'kot:read'),
    ('CAPTAIN', 'bill:read'),
    ('CAPTAIN', 'bill:generate'),
    ('CAPTAIN', 'payment:read'),
    ('CAPTAIN', 'payment:write'),
    ('RECEPTION', 'dashboard:read'),
    ('RECEPTION', 'menu:read'),
    ('RECEPTION', 'floor:read'),
    ('RECEPTION', 'table:update-status'),
    ('RECEPTION', 'reservation:read'),
    ('RECEPTION', 'reservation:write'),
    ('RECEPTION', 'reservation:assign-table'),
    ('RECEPTION', 'order:read'),
    ('RECEPTION', 'bill:read'),
    ('RECEPTION', 'bill:generate'),
    ('RECEPTION', 'bill:update'),
    ('RECEPTION', 'payment:read'),
    ('RECEPTION', 'payment:write'),
    ('KITCHEN_STAFF', 'dashboard:read'),
    ('KITCHEN_STAFF', 'menu:read'),
    ('KITCHEN_STAFF', 'order:read'),
    ('KITCHEN_STAFF', 'kot:read'),
    ('KITCHEN_STAFF', 'kot:write'),
    ('KITCHEN_STAFF', 'kot:update-status'),
    ('BAR_STAFF', 'dashboard:read'),
    ('BAR_STAFF', 'menu:read'),
    ('BAR_STAFF', 'order:read'),
    ('BAR_STAFF', 'kot:read'),
    ('BAR_STAFF', 'kot:write'),
    ('BAR_STAFF', 'kot:update-status')
  ) AS d(role_name, permission) ON d.role_name = r."name"
ON CONFLICT DO NOTHING;
