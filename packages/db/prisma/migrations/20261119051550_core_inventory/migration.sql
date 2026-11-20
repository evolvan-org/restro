-- CreateEnum
CREATE TYPE "InventoryBaseUnit" AS ENUM ('G', 'ML', 'UNIT');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('OPENING', 'ADJUSTMENT', 'RECEIPT', 'WASTE');

-- CreateEnum
CREATE TYPE "InventoryPurchaseStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "stock_items" ADD COLUMN     "average_unit_cost" DECIMAL(18,8),
ADD COLUMN     "base_unit" "InventoryBaseUnit",
ADD COLUMN     "current_stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "opened_at" TIMESTAMPTZ(6),
ADD COLUMN     "reorder_level" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "sku" VARCHAR(60);

-- CreateTable
CREATE TABLE "stock_batches" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "receipt_line_id" UUID,
    "batch_number" VARCHAR(80) NOT NULL,
    "quantity_received" DECIMAL(12,3) NOT NULL,
    "quantity_remaining" DECIMAL(12,3) NOT NULL,
    "unit_cost" DECIMAL(18,8) NOT NULL,
    "expiry_date" DATE,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "batch_id" UUID,
    "receipt_id" UUID,
    "actor_id" UUID NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_cost" DECIMAL(18,8),
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_suppliers" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "contact_name" VARCHAR(150) NOT NULL DEFAULT '',
    "email" VARCHAR(255) NOT NULL DEFAULT '',
    "phone" VARCHAR(30) NOT NULL DEFAULT '',
    "address" VARCHAR(500) NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_purchase_orders" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "InventoryPurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "expected_date" DATE,
    "notes" VARCHAR(500) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_purchase_order_lines" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "quantity_received" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(18,8) NOT NULL,

    CONSTRAINT "inventory_purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_receipts" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "purchase_order_id" UUID,
    "actor_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "notes" VARCHAR(500) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_receipt_lines" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "stock_item_id" UUID NOT NULL,
    "purchase_order_line_id" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_cost" DECIMAL(18,8) NOT NULL,
    "batch_number" VARCHAR(80) NOT NULL,
    "expiry_date" DATE,

    CONSTRAINT "inventory_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_receipt_line_id_key" ON "stock_batches"("receipt_line_id");

-- CreateIndex
CREATE INDEX "stock_batches_restaurant_id_stock_item_id_received_at_idx" ON "stock_batches"("restaurant_id", "stock_item_id", "received_at");

-- CreateIndex
CREATE INDEX "stock_batches_restaurant_id_expiry_date_idx" ON "stock_batches"("restaurant_id", "expiry_date");

-- CreateIndex
CREATE INDEX "stock_movements_restaurant_id_created_at_idx" ON "stock_movements"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_restaurant_id_stock_item_id_created_at_idx" ON "stock_movements"("restaurant_id", "stock_item_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_batch_id_idx" ON "stock_movements"("batch_id");

-- CreateIndex
CREATE INDEX "stock_movements_receipt_id_idx" ON "stock_movements"("receipt_id");

-- CreateIndex
CREATE INDEX "inventory_suppliers_restaurant_id_is_active_idx" ON "inventory_suppliers"("restaurant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_suppliers_restaurant_id_name_key" ON "inventory_suppliers"("restaurant_id", "name");

-- CreateIndex
CREATE INDEX "inventory_purchase_orders_restaurant_id_status_number_idx" ON "inventory_purchase_orders"("restaurant_id", "status", "number");

-- CreateIndex
CREATE INDEX "inventory_purchase_orders_supplier_id_idx" ON "inventory_purchase_orders"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_purchase_orders_restaurant_id_number_key" ON "inventory_purchase_orders"("restaurant_id", "number");

-- CreateIndex
CREATE INDEX "inventory_purchase_order_lines_stock_item_id_idx" ON "inventory_purchase_order_lines"("stock_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_purchase_order_lines_purchase_order_id_stock_item_key" ON "inventory_purchase_order_lines"("purchase_order_id", "stock_item_id");

-- CreateIndex
CREATE INDEX "inventory_receipts_supplier_id_idx" ON "inventory_receipts"("supplier_id");

-- CreateIndex
CREATE INDEX "inventory_receipts_purchase_order_id_idx" ON "inventory_receipts"("purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_receipts_restaurant_id_number_key" ON "inventory_receipts"("restaurant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_receipts_restaurant_id_idempotency_key_key" ON "inventory_receipts"("restaurant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "inventory_receipt_lines_receipt_id_idx" ON "inventory_receipt_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "inventory_receipt_lines_stock_item_id_idx" ON "inventory_receipt_lines"("stock_item_id");

-- CreateIndex
CREATE INDEX "inventory_receipt_lines_purchase_order_line_id_idx" ON "inventory_receipt_lines"("purchase_order_line_id");

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_receipt_line_id_fkey" FOREIGN KEY ("receipt_line_id") REFERENCES "inventory_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_suppliers" ADD CONSTRAINT "inventory_suppliers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_purchase_orders" ADD CONSTRAINT "inventory_purchase_orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_purchase_orders" ADD CONSTRAINT "inventory_purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "inventory_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_purchase_orders" ADD CONSTRAINT "inventory_purchase_orders_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_purchase_order_lines" ADD CONSTRAINT "inventory_purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "inventory_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_purchase_order_lines" ADD CONSTRAINT "inventory_purchase_order_lines_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "inventory_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "inventory_purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipt_lines" ADD CONSTRAINT "inventory_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipt_lines" ADD CONSTRAINT "inventory_receipt_lines_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipt_lines" ADD CONSTRAINT "inventory_receipt_lines_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "inventory_purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
