-- AlterTable
ALTER TABLE "kots" ADD COLUMN     "accepted_at" TIMESTAMPTZ(6),
ADD COLUMN     "control_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "held_at" TIMESTAMPTZ(6),
ADD COLUMN     "hold_reason" VARCHAR(255),
ADD COLUMN     "is_priority" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "target_seconds" INTEGER;

-- CreateTable
CREATE TABLE "preparation_events" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "kot_id" UUID NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "status" "KotStatus" NOT NULL,
    "version" INTEGER NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "held_at" TIMESTAMPTZ(6),
    "hold_reason" VARCHAR(255),
    "is_priority" BOOLEAN NOT NULL,
    "target_seconds" INTEGER,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preparation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preparation_events_restaurant_id_kot_id_created_at_idx" ON "preparation_events"("restaurant_id", "kot_id", "created_at");

-- CreateIndex
CREATE INDEX "preparation_events_recorded_by_user_id_idx" ON "preparation_events"("recorded_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "preparation_events_kot_id_version_key" ON "preparation_events"("kot_id", "version");

-- AddForeignKey
ALTER TABLE "preparation_events" ADD CONSTRAINT "preparation_events_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_events" ADD CONSTRAINT "preparation_events_kot_id_fkey" FOREIGN KEY ("kot_id") REFERENCES "kots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_events" ADD CONSTRAINT "preparation_events_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
