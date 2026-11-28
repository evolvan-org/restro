ALTER TYPE "StockMovementKind" ADD VALUE 'USAGE';

ALTER TABLE "payments" ADD COLUMN "tenders" JSONB;
ALTER TABLE "kot_items" ADD COLUMN "stock_usage_issue" VARCHAR(500);
ALTER TABLE "stock_movements" ADD COLUMN "kot_item_id" UUID;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_kot_item_id_fkey"
  FOREIGN KEY ("kot_item_id") REFERENCES "kot_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "stock_movements_kot_item_id_idx" ON "stock_movements"("kot_item_id");
