-- CreateEnum
CREATE TYPE "OperatingTaskKind" AS ENUM ('OPENING', 'CLOSING', 'CLEANING', 'TEMPERATURE', 'EXPIRY');

-- CreateEnum
CREATE TYPE "OperatingTaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXCEPTION', 'CANCELLED');

-- CreateTable
CREATE TABLE "operating_tasks" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "assigned_to_user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "kind" "OperatingTaskKind" NOT NULL,
    "instructions" VARCHAR(2000) NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "OperatingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(6),
    "result" JSONB,
    "resolution" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "operating_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operating_task_events" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "was_overdue" BOOLEAN NOT NULL,
    "reason" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operating_task_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operating_tasks_restaurant_id_status_due_at_idx" ON "operating_tasks"("restaurant_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "operating_tasks_assigned_to_user_id_due_at_idx" ON "operating_tasks"("assigned_to_user_id", "due_at");

-- CreateIndex
CREATE INDEX "operating_tasks_created_by_user_id_idx" ON "operating_tasks"("created_by_user_id");

-- CreateIndex
CREATE INDEX "operating_task_events_restaurant_id_task_id_created_at_idx" ON "operating_task_events"("restaurant_id", "task_id", "created_at");

-- CreateIndex
CREATE INDEX "operating_task_events_recorded_by_user_id_idx" ON "operating_task_events"("recorded_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "operating_task_events_task_id_version_key" ON "operating_task_events"("task_id", "version");

-- AddForeignKey
ALTER TABLE "operating_tasks" ADD CONSTRAINT "operating_tasks_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_tasks" ADD CONSTRAINT "operating_tasks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_tasks" ADD CONSTRAINT "operating_tasks_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_task_events" ADD CONSTRAINT "operating_task_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_task_events" ADD CONSTRAINT "operating_task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "operating_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_task_events" ADD CONSTRAINT "operating_task_events_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
