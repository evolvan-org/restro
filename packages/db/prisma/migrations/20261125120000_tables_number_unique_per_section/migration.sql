-- Table numbers are unique per dining section (case-insensitive), not per restaurant.
-- The new rule is looser than the old one, so existing data cannot conflict.
DROP INDEX "restaurant_tables_restaurant_id_lower_table_number_key";
DROP INDEX "restaurant_tables_restaurant_id_table_number_key";

CREATE UNIQUE INDEX "restaurant_tables_restaurant_id_section_id_table_number_key"
  ON "restaurant_tables"("restaurant_id", "section_id", "table_number");

CREATE UNIQUE INDEX "restaurant_tables_restaurant_id_section_id_lower_table_number_key"
  ON "restaurant_tables" ("restaurant_id", "section_id", lower("table_number"));
