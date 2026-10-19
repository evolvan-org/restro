-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('G', 'KG', 'ML', 'L', 'UNIT');

-- CreateTable
CREATE TABLE "stock_items" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_items" (
    "id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" "Unit" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_items_restaurant_id_idx" ON "stock_items"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_restaurant_id_name_key" ON "stock_items"("restaurant_id", "name");

-- CreateIndex
CREATE INDEX "recipe_items_menu_item_id_idx" ON "recipe_items"("menu_item_id");

-- CreateIndex
CREATE INDEX "recipe_items_stock_item_id_idx" ON "recipe_items"("stock_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_items_menu_item_id_stock_item_id_key" ON "recipe_items"("menu_item_id", "stock_item_id");

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Item names are unique per category ignoring case, among active (non-deleted) items only, so a
-- soft-deleted item's name can be reused. Prisma cannot express partial/expression indexes.
-- Fails if existing active rows already collide; resolve those before deploying.
CREATE UNIQUE INDEX "menu_items_restaurant_category_lower_name_active_key"
  ON "menu_items" ("restaurant_id", "category_id", lower("name"))
  WHERE "is_active" = true;
