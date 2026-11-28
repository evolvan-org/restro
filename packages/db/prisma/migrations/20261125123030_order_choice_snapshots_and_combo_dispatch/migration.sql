-- AlterTable
ALTER TABLE "kot_items" ADD COLUMN     "component_menu_item_id" UUID,
ADD COLUMN     "instructions_snapshot" TEXT,
ADD COLUMN     "name_snapshot" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "configuration_key" VARCHAR(64),
ADD COLUMN     "item_type_snapshot" "ServingType",
ADD COLUMN     "name_snapshot" TEXT,
ADD COLUMN     "recipe_snapshot" JSONB,
ADD COLUMN     "selection_snapshot" JSONB,
ADD COLUMN     "sent_quantity" INTEGER;

-- CreateIndex
CREATE INDEX "kot_items_component_menu_item_id_idx" ON "kot_items"("component_menu_item_id");

-- AddForeignKey
ALTER TABLE "kot_items" ADD CONSTRAINT "kot_items_component_menu_item_id_fkey" FOREIGN KEY ("component_menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
