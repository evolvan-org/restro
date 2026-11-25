-- CreateEnum
CREATE TYPE "DietType" AS ENUM ('VEG', 'NON_VEG', 'EGG');

-- CreateEnum
CREATE TYPE "RecipeSource" AS ENUM ('MANUAL', 'AI_DRAFT');

-- CreateEnum
CREATE TYPE "AiJobKind" AS ENUM ('MENU_SCAN', 'INVOICE_SCAN', 'RECIPE_DRAFT');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiJobContext" AS ENUM ('ONBOARDING', 'POST_ONBOARDING');

-- CreateEnum
CREATE TYPE "IngredientPriceSource" AS ENUM ('SEED', 'AI');

-- CreateEnum
CREATE TYPE "PortionStyle" AS ENUM ('LIGHT', 'STANDARD', 'GENEROUS');

-- AlterTable
ALTER TABLE "inventory_receipts" ADD COLUMN     "invoice_total" DECIMAL(14,2),
ADD COLUMN     "scan_job_id" UUID,
ADD COLUMN     "supplier_invoice_date" DATE,
ADD COLUMN     "supplier_invoice_number" VARCHAR(50),
ADD COLUMN     "tax_breakdown" JSONB;

-- AlterTable
ALTER TABLE "inventory_suppliers" ADD COLUMN     "gstin" VARCHAR(15);

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "diet_type" "DietType",
ADD COLUMN     "recipe_reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "recipe_source" "RecipeSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "variant_id" UUID,
ADD COLUMN     "variant_name" VARCHAR(50);

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "target_food_cost_max" DECIMAL(5,2) NOT NULL DEFAULT 35,
ADD COLUMN     "target_food_cost_min" DECIMAL(5,2) NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "stock_items" ADD COLUMN     "estimated_unit_cost" DECIMAL(18,8);

-- CreateTable
CREATE TABLE "menu_item_variants" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "portion_factor" DECIMAL(5,3) NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_item_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "kind" "AiJobKind" NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'QUEUED',
    "context" "AiJobContext" NOT NULL,
    "input" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "pages_total" INTEGER NOT NULL DEFAULT 0,
    "pages_done" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(40),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "images_purged_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_job_items" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "page" INTEGER,
    "data" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_job_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "restaurant_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "kind" "AiJobKind" NOT NULL,
    "jobs" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("restaurant_id","day","kind")
);

-- CreateTable
CREATE TABLE "ingredient_catalog" (
    "id" UUID NOT NULL,
    "canonical_name" VARCHAR(150) NOT NULL,
    "base_unit" "InventoryBaseUnit" NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimated_price_per_base" DECIMAL(18,8) NOT NULL,
    "price_source" "IngredientPriceSource" NOT NULL DEFAULT 'SEED',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ingredient_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_templates" (
    "id" UUID NOT NULL,
    "dish_key" VARCHAR(200) NOT NULL,
    "portion_style" "PortionStyle" NOT NULL,
    "lines" JSONB NOT NULL,
    "note" VARCHAR(500),
    "model" VARCHAR(80) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_item_variants_restaurant_id_idx" ON "menu_item_variants"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_variants_menu_item_id_name_key" ON "menu_item_variants"("menu_item_id", "name");

-- CreateIndex
CREATE INDEX "ai_jobs_restaurant_id_kind_created_at_idx" ON "ai_jobs"("restaurant_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_job_items_job_id_seq_key" ON "ai_job_items"("job_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_catalog_canonical_name_key" ON "ingredient_catalog"("canonical_name");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_templates_dish_key_portion_style_key" ON "recipe_templates"("dish_key", "portion_style");

-- CreateIndex
CREATE INDEX "inventory_receipts_restaurant_id_supplier_id_supplier_invoi_idx" ON "inventory_receipts"("restaurant_id", "supplier_id", "supplier_invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_suppliers_restaurant_id_gstin_key" ON "inventory_suppliers"("restaurant_id", "gstin");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- AddForeignKey
ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_item_variants_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_item_variants_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "menu_item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_job_items" ADD CONSTRAINT "ai_job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "ai_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

