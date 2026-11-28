-- CreateEnum
CREATE TYPE "KotPrintStatus" AS ENUM ('QUEUED', 'PRINTING', 'SENT', 'UNCONFIRMED');

-- AlterTable
ALTER TABLE "kots" ADD COLUMN     "print_attempt_at" TIMESTAMPTZ(6),
ADD COLUMN     "print_status" "KotPrintStatus";

-- AlterTable
ALTER TABLE "thermal_printers" ADD COLUMN     "auto_print" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ticket_layout" VARCHAR(10) NOT NULL DEFAULT 'STANDARD';
