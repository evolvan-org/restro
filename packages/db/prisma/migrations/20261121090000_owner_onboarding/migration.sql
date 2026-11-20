-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "onboarding_completed_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "recipe_required" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "onboarding_drafts" (
    "restaurant_id" UUID NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "skipped_steps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "data" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "onboarding_drafts_pkey" PRIMARY KEY ("restaurant_id")
);

-- AddForeignKey
ALTER TABLE "onboarding_drafts" ADD CONSTRAINT "onboarding_drafts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing restaurants were set up before guided onboarding existed: never send them into it.
UPDATE "restaurants" SET "onboarding_completed_at" = now() WHERE "onboarding_completed_at" IS NULL;

-- Signup used to seed no table statuses or cancellation reasons, leaving fresh tenants unable to run
-- the floor or cancel bills. Backfill the system defaults wherever they are missing.
INSERT INTO "table_statuses" ("id", "restaurant_id", "code", "name", "sort_order", "is_system", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), r."id", s."code", s."name", s."sort_order", true, true, now(), now()
FROM "restaurants" r
CROSS JOIN (VALUES
  ('AVAILABLE', 'Available', 0),
  ('RESERVED', 'Reserved', 1),
  ('OCCUPIED', 'Occupied', 2),
  ('NEEDS_CLEANING', 'Cleaning', 3)
) AS s("code", "name", "sort_order")
ON CONFLICT ("restaurant_id", "code") DO NOTHING;

INSERT INTO "bill_cancellation_reasons" ("id", "restaurant_id", "code", "name", "sort_order", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), r."id", c."code", c."name", c."sort_order", true, now(), now()
FROM "restaurants" r
CROSS JOIN (VALUES
  ('GUEST_REQUEST', 'Guest request', 0),
  ('DUPLICATE_BILL', 'Duplicate bill', 1),
  ('BILLING_ERROR', 'Billing error', 2),
  ('ORDER_CHANGED', 'Order changed', 3),
  ('OTHER', 'Other', 4)
) AS c("code", "name", "sort_order")
ON CONFLICT ("restaurant_id", "code") DO NOTHING;
