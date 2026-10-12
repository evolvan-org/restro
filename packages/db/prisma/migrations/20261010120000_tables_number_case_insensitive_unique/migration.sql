-- Table numbers are unique per restaurant ignoring case ("A1" and "a1" cannot coexist).
-- Prisma cannot express expression indexes in the schema, so it lives here. The plain
-- @@unique([restaurantId, tableNumber]) stays in the schema; this index is the stricter rule.
-- Fails if existing rows already collide case-insensitively; resolve those before deploying.
CREATE UNIQUE INDEX "restaurant_tables_restaurant_id_lower_table_number_key"
  ON "restaurant_tables" ("restaurant_id", lower("table_number"));
