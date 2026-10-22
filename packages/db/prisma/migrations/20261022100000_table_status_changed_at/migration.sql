ALTER TABLE "restaurant_tables" ADD COLUMN "status_changed_at" TIMESTAMPTZ(6);

UPDATE "restaurant_tables" SET "status_changed_at" = "updated_at";

ALTER TABLE "restaurant_tables" ALTER COLUMN "status_changed_at" SET NOT NULL;

ALTER TABLE "restaurant_tables" ALTER COLUMN "status_changed_at" SET DEFAULT now();
