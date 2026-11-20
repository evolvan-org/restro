-- CreateEnum
CREATE TYPE "InventorySupplyUnit" AS ENUM ('G', 'KG', 'ML', 'L', 'UNIT', 'PACK', 'BOX', 'BAG');

-- AlterTable
ALTER TABLE "inventory_purchase_order_lines" ADD COLUMN     "package_quantity" DECIMAL(12,3),
ADD COLUMN     "package_unit" "Unit",
ADD COLUMN     "unit" "InventorySupplyUnit";

-- AlterTable
ALTER TABLE "inventory_receipt_lines" ADD COLUMN     "package_quantity" DECIMAL(12,3),
ADD COLUMN     "package_unit" "Unit",
ADD COLUMN     "unit" "InventorySupplyUnit";
