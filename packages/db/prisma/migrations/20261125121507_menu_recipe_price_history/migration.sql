-- AlterTable
ALTER TABLE "recipe_items" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "menu_item_revisions" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "reason" VARCHAR(30) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_item_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_item_revisions_restaurant_id_menu_item_id_created_at_idx" ON "menu_item_revisions"("restaurant_id", "menu_item_id", "created_at");

-- CreateIndex
CREATE INDEX "menu_item_revisions_recorded_by_user_id_idx" ON "menu_item_revisions"("recorded_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_revisions_menu_item_id_revision_key" ON "menu_item_revisions"("menu_item_id", "revision");

-- AddForeignKey
ALTER TABLE "menu_item_revisions" ADD CONSTRAINT "menu_item_revisions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_revisions" ADD CONSTRAINT "menu_item_revisions_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_revisions" ADD CONSTRAINT "menu_item_revisions_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
