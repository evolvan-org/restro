-- AlterEnum
ALTER TYPE "AuthRateLimitAction" ADD VALUE 'AUTHENTICATOR_ATTEMPT';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "tip_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "authenticator_counter" INTEGER,
ADD COLUMN     "authenticator_pending" TEXT,
ADD COLUMN     "authenticator_pending_until" TIMESTAMPTZ(6),
ADD COLUMN     "authenticator_recovery_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "authenticator_secret" TEXT,
ADD COLUMN     "authenticator_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "restaurant_logos" (
    "restaurant_id" UUID NOT NULL,
    "mime_type" VARCHAR(20),
    "data" BYTEA,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "restaurant_logos_pkey" PRIMARY KEY ("restaurant_id")
);

-- AddForeignKey
ALTER TABLE "restaurant_logos" ADD CONSTRAINT "restaurant_logos_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
