-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "entity" VARCHAR(30) NOT NULL,
    "entity_id" UUID NOT NULL,
    "table_id" UUID,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_restaurant_id_recipient_user_id_created_at_id_idx" ON "notifications"("restaurant_id", "recipient_user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "notifications_restaurant_id_recipient_user_id_read_at_idx" ON "notifications"("restaurant_id", "recipient_user_id", "read_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
