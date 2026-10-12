-- One guest per phone number within a restaurant. Concurrent walk-ins/bookings for the same
-- phone previously raced find-then-create and could insert duplicate guest rows.

-- Merge any existing duplicates into the oldest guest of each (restaurant, phone) pair so the
-- unique index can be created: repoint their reservations, then delete the extra rows.
WITH ranked AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "restaurant_id", "phone_number"
      ORDER BY "created_at", "id"
    ) AS "keep_id"
  FROM "guests"
),
duplicates AS (
  SELECT "id", "keep_id" FROM ranked WHERE "id" <> "keep_id"
),
repointed AS (
  -- Data-modifying CTEs always run, even though nothing selects from this one.
  UPDATE "reservations" r
  SET "guest_id" = d."keep_id"
  FROM duplicates d
  WHERE r."guest_id" = d."id"
  RETURNING r."id"
)
DELETE FROM "guests" g
USING duplicates d
WHERE g."id" = d."id";

-- The composite unique index also serves restaurant_id lookups, so the old single-column
-- index is redundant.
DROP INDEX IF EXISTS "guests_restaurant_id_idx";

CREATE UNIQUE INDEX "guests_restaurant_id_phone_number_key"
  ON "guests" ("restaurant_id", "phone_number");
