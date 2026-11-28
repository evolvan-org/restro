-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "clock_in_at" TIMESTAMPTZ(6) NOT NULL,
    "clock_out_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "applied_correction_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_breaks" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "attendance_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(2000) NOT NULL,
    "timeline" JSONB NOT NULL,
    "original_timeline" JSONB NOT NULL,
    "base_session_version" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "review_note" VARCHAR(2000),
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "correction_id" UUID,
    "action" VARCHAR(30) NOT NULL,
    "device_label" VARCHAR(120),
    "location_label" VARCHAR(255),
    "user_agent" VARCHAR(1000),
    "note" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_applied_correction_id_key" ON "attendance_sessions"("applied_correction_id");

-- CreateIndex
CREATE INDEX "attendance_sessions_restaurant_id_user_id_clock_in_at_idx" ON "attendance_sessions"("restaurant_id", "user_id", "clock_in_at");

-- CreateIndex
CREATE INDEX "attendance_sessions_restaurant_id_clock_out_at_idx" ON "attendance_sessions"("restaurant_id", "clock_out_at");

-- CreateIndex
CREATE INDEX "attendance_breaks_session_id_started_at_idx" ON "attendance_breaks"("session_id", "started_at");

-- CreateIndex
CREATE INDEX "attendance_corrections_restaurant_id_status_created_at_idx" ON "attendance_corrections"("restaurant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "attendance_corrections_session_id_idx" ON "attendance_corrections"("session_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_user_id_idx" ON "attendance_corrections"("user_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_requested_by_user_id_idx" ON "attendance_corrections"("requested_by_user_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_reviewed_by_user_id_idx" ON "attendance_corrections"("reviewed_by_user_id");

-- CreateIndex
CREATE INDEX "attendance_events_restaurant_id_session_id_created_at_idx" ON "attendance_events"("restaurant_id", "session_id", "created_at");

-- CreateIndex
CREATE INDEX "attendance_events_recorded_by_user_id_idx" ON "attendance_events"("recorded_by_user_id");

-- CreateIndex
CREATE INDEX "attendance_events_correction_id_idx" ON "attendance_events"("correction_id");

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_applied_correction_id_fkey" FOREIGN KEY ("applied_correction_id") REFERENCES "attendance_corrections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "attendance_corrections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma does not model partial unique indexes. Keep concurrent clock/break opens unique
-- even if a writer outside the application fails to acquire the user/session locks.
CREATE UNIQUE INDEX "attendance_one_open_session_per_user" ON "attendance_sessions" ("restaurant_id", "user_id") WHERE "clock_out_at" IS NULL;
CREATE UNIQUE INDEX "attendance_one_open_break_per_session" ON "attendance_breaks" ("session_id") WHERE "ended_at" IS NULL;
