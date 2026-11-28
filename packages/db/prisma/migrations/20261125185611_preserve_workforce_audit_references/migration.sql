-- DropForeignKey
ALTER TABLE "attendance_corrections" DROP CONSTRAINT "attendance_corrections_reviewed_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "attendance_events" DROP CONSTRAINT "attendance_events_correction_id_fkey";

-- DropForeignKey
ALTER TABLE "attendance_sessions" DROP CONSTRAINT "attendance_sessions_applied_correction_id_fkey";

-- DropForeignKey
ALTER TABLE "staff_leave" DROP CONSTRAINT "staff_leave_reviewed_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "workforce_events" DROP CONSTRAINT "workforce_events_availability_id_fkey";

-- DropForeignKey
ALTER TABLE "workforce_events" DROP CONSTRAINT "workforce_events_leave_id_fkey";

-- DropForeignKey
ALTER TABLE "workforce_events" DROP CONSTRAINT "workforce_events_shift_id_fkey";

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_applied_correction_id_fkey" FOREIGN KEY ("applied_correction_id") REFERENCES "attendance_corrections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "attendance_corrections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_leave" ADD CONSTRAINT "staff_leave_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_events" ADD CONSTRAINT "workforce_events_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "staff_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_events" ADD CONSTRAINT "workforce_events_availability_id_fkey" FOREIGN KEY ("availability_id") REFERENCES "staff_availability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce_events" ADD CONSTRAINT "workforce_events_leave_id_fkey" FOREIGN KEY ("leave_id") REFERENCES "staff_leave"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
