-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "captain_user_id" UUID;

-- CreateIndex
CREATE INDEX "reservations_captain_user_id_idx" ON "reservations"("captain_user_id");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_captain_user_id_fkey" FOREIGN KEY ("captain_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
