-- AddEnumValue
ALTER TYPE "UserStatus" ADD VALUE 'INVITED' BEFORE 'ACTIVE';

-- CreateEnum
CREATE TYPE "UserTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'STAFF_INVITE');

-- CreateEnum
CREATE TYPE "AuthRateLimitAction" AS ENUM (
    'RESEND_VERIFICATION_MINUTE',
    'RESEND_VERIFICATION_HOUR',
    'FORGOT_PASSWORD_EMAIL',
    'FORGOT_PASSWORD_IP',
    'RESEND_STAFF_INVITE_MINUTE',
    'RESEND_STAFF_INVITE_HOUR',
    'STAFF_PASSWORD_RESET_HOUR'
);

-- AlterTable
ALTER TABLE "users"
    ALTER COLUMN "password_hash" DROP NOT NULL,
    ADD COLUMN "email_verified_at" TIMESTAMPTZ(6),
    ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0;

-- Existing accounts predate verification and remain trusted after rollout.
UPDATE "users" SET "email_verified_at" = "created_at";

-- CreateTable
CREATE TABLE "user_tokens" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "UserTokenType" NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_rate_limit_counters" (
    "id" UUID NOT NULL,
    "action" "AuthRateLimitAction" NOT NULL,
    "subject_hash" VARCHAR(64) NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_rate_limit_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_tokens_token_hash_key" ON "user_tokens"("token_hash");
CREATE INDEX "user_tokens_restaurant_id_idx" ON "user_tokens"("restaurant_id");
CREATE INDEX "user_tokens_user_id_idx" ON "user_tokens"("user_id");
CREATE INDEX "user_tokens_user_id_type_created_at_idx" ON "user_tokens"("user_id", "type", "created_at");
CREATE UNIQUE INDEX "auth_rate_limit_counters_action_subject_hash_window_start_key"
    ON "auth_rate_limit_counters"("action", "subject_hash", "window_start");
CREATE INDEX "auth_rate_limit_counters_expires_at_idx" ON "auth_rate_limit_counters"("expires_at");

-- AddForeignKey
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
