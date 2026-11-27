-- AlterTable
ALTER TABLE "thermal_printers" ADD COLUMN     "usb_device" VARCHAR(32);

-- CreateTable
CREATE TABLE "thermal_print_connectors" (
    "restaurant_id" UUID NOT NULL,
    "token_hash" VARCHAR(64),

    CONSTRAINT "thermal_print_connectors_pkey" PRIMARY KEY ("restaurant_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "thermal_print_connectors_token_hash_key" ON "thermal_print_connectors"("token_hash");

-- AddForeignKey
ALTER TABLE "thermal_print_connectors" ADD CONSTRAINT "thermal_print_connectors_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
