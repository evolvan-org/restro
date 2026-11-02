-- Preserve existing notification values. An out-of-contract value aborts the
-- conversion instead of deleting/replacing any notification data.
BEGIN;

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('kot.sent', 'kot.ready', 'reservation.created');

-- CreateEnum
CREATE TYPE "NotificationEntity" AS ENUM ('order', 'reservation');

-- AlterTable
ALTER TABLE "notifications"
  ALTER COLUMN "type" TYPE "NotificationType"
    USING ("type"::text::"NotificationType"),
  ALTER COLUMN "entity" TYPE "NotificationEntity"
    USING ("entity"::text::"NotificationEntity");

COMMIT;
