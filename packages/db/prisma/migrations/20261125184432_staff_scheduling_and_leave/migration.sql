-- CreateEnum
CREATE TYPE "StaffShiftStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StaffAvailabilityKind" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "StaffLeaveKind" AS ENUM ('ANNUAL', 'SICK', 'UNPAID', 'OTHER');

-- CreateEnum
CREATE TYPE "StaffLeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "staff_shifts" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "status" "StaffShiftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_availability" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "kind" "StaffAvailabilityKind" NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_leave" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "kind" "StaffLeaveKind" NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "status" "StaffLeaveStatus" NOT NULL DEFAULT 'PENDING',
    "review_note" VARCHAR(2000),
    "reviewed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workforce_events" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "shift_id" UUID,
    "availability_id" UUID,
    "leave_id" UUID,
    "entity_version" INTEGER NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workforce_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_shifts_restaurant_id_user_id_starts_at_ends_at_idx" ON "staff_shifts"("restaurant_id", "user_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "staff_shifts_created_by_user_id_idx" ON "staff_shifts"("created_by_user_id");

-- CreateIndex
CREATE INDEX "staff_availability_restaurant_id_user_id_starts_at_ends_at_idx" ON "staff_availability"("restaurant_id", "user_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "staff_leave_restaurant_id_user_id_status_starts_at_ends_at_idx" ON "staff_leave"("restaurant_id", "user_id", "status", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "staff_leave_requested_by_user_id_idx" ON "staff_leave"("requested_by_user_id");

-- CreateIndex
CREATE INDEX "staff_leave_reviewed_by_user_id_idx" ON "staff_leave"("reviewed_by_user_id");

-- CreateIndex
CREATE INDEX "workforce_events_restaurant_id_user_id_created_at_idx" ON "workforce_events"("restaurant_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "workforce_events_recorded_by_user_id_idx" ON "workforce_events"("recorded_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workforce_events_shift_id_entity_version_key" ON "workforce_events"("shift_id", "entity_version");

-- CreateIndex
CREATE UNIQUE INDEX "workforce_events_availability_id_entity_version_key" ON "workforce_events"("availability_id", "entity_version");

-- CreateIndex
CREATE UNIQUE INDEX "workforce_events_leave_id_entity_version_key" ON "workforce_events"("leave_id", "entity_version");

-- AddForeignKey
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_shifts" ADD CONSTRAINT "staff_shifts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leave" ADD CONSTRAINT "staff_leave_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leave" ADD CONSTRAINT "staff_leave_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leave" ADD CONSTRAINT "staff_leave_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leave" ADD CONSTRAINT "staff_leave_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_events" ADD CONSTRAINT "workforce_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_events" ADD CONSTRAINT "workforce_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_events" ADD CONSTRAINT "workforce_events_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_events" ADD CONSTRAINT "workforce_events_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "staff_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_events" ADD CONSTRAINT "workforce_events_availability_id_fkey" FOREIGN KEY ("availability_id") REFERENCES "staff_availability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_events" ADD CONSTRAINT "workforce_events_leave_id_fkey" FOREIGN KEY ("leave_id") REFERENCES "staff_leave"("id") ON DELETE SET NULL ON UPDATE CASCADE;
