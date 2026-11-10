-- CreateTable
CREATE TABLE "bill_cancellation_reasons" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bill_cancellation_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bill_cancellation_reasons_restaurant_id_is_active_sort_orde_idx" ON "bill_cancellation_reasons"("restaurant_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "bill_cancellation_reasons_restaurant_id_code_key" ON "bill_cancellation_reasons"("restaurant_id", "code");

-- AddForeignKey
ALTER TABLE "bill_cancellation_reasons" ADD CONSTRAINT "bill_cancellation_reasons_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
