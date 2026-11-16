-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "cancellation_reason" VARCHAR(255);

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "address" VARCHAR(500),
ADD COLUMN     "max_discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 20;
