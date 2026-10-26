-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "captain_user_id" UUID;

-- Restore preserved assignments only while their captain still belongs to the tenant.
-- If the old migration already ran before preservation was deployed, its lost values
-- cannot be recovered by this migration.
UPDATE "reservations" r
SET "captain_user_id" = r."captain_user_id_before_move"
FROM "users" u
WHERE u."id" = r."captain_user_id_before_move"
  AND u."restaurant_id" = r."restaurant_id";

ALTER TABLE "reservations" DROP COLUMN "captain_user_id_before_move";

-- CreateIndex
CREATE INDEX "reservations_captain_user_id_idx" ON "reservations"("captain_user_id");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_captain_user_id_fkey" FOREIGN KEY ("captain_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
