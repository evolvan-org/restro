-- Estimated ingredient prices are removed (REST-89): food cost comes only from a restaurant's real
-- purchases (invoices, opening stock costs). Catalog rows added by the AI price lookup existed only
-- as a price cache, so they go; the seeded names, aliases and units stay.
DELETE FROM "ingredient_catalog" WHERE "price_source" = 'AI';

ALTER TABLE "ingredient_catalog" DROP COLUMN "estimated_price_per_base",
DROP COLUMN "price_source";

DROP TYPE "IngredientPriceSource";

ALTER TABLE "stock_items" DROP COLUMN "estimated_unit_cost";
