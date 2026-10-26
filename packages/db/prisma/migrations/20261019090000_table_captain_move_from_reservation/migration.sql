-- DropForeignKey
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_captain_user_id_fkey";

-- DropIndex
DROP INDEX "reservations_captain_user_id_idx";

-- AlterTable
ALTER TABLE "reservations" DROP COLUMN "captain_user_id";

-- AlterTable
ALTER TABLE "restaurant_tables" ADD COLUMN     "captain_user_id" UUID;

-- CreateIndex
CREATE INDEX "restaurant_tables_captain_user_id_idx" ON "restaurant_tables"("captain_user_id");

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_captain_user_id_fkey" FOREIGN KEY ("captain_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

