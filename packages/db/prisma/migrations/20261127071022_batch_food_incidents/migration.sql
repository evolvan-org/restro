-- CreateEnum
CREATE TYPE "FoodIncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FoodIncidentEntryKind" AS ENUM ('CREATED', 'NOTE', 'DECISION', 'CORRECTIVE_ACTION', 'RESOLVED');

-- CreateTable
CREATE TABLE "food_incidents" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "status" "FoodIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "resolved_by_user_id" UUID,
    "resolution" VARCHAR(4000),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "food_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_incident_batches" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_incident_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_incident_entries" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "kind" "FoodIncidentEntryKind" NOT NULL,
    "note" VARCHAR(4000) NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_incident_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_incidents_restaurant_id_status_created_at_idx" ON "food_incidents"("restaurant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "food_incidents_created_by_user_id_idx" ON "food_incidents"("created_by_user_id");

-- CreateIndex
CREATE INDEX "food_incidents_resolved_by_user_id_idx" ON "food_incidents"("resolved_by_user_id");

-- CreateIndex
CREATE INDEX "food_incident_batches_restaurant_id_batch_id_idx" ON "food_incident_batches"("restaurant_id", "batch_id");

-- CreateIndex
CREATE INDEX "food_incident_batches_batch_id_idx" ON "food_incident_batches"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_incident_batches_incident_id_batch_id_key" ON "food_incident_batches"("incident_id", "batch_id");

-- CreateIndex
CREATE INDEX "food_incident_entries_restaurant_id_incident_id_created_at_idx" ON "food_incident_entries"("restaurant_id", "incident_id", "created_at");

-- CreateIndex
CREATE INDEX "food_incident_entries_actor_id_idx" ON "food_incident_entries"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_incident_entries_incident_id_version_key" ON "food_incident_entries"("incident_id", "version");

-- AddForeignKey
ALTER TABLE "food_incidents" ADD CONSTRAINT "food_incidents_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_incidents" ADD CONSTRAINT "food_incidents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_incidents" ADD CONSTRAINT "food_incidents_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_incident_batches" ADD CONSTRAINT "food_incident_batches_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_incident_batches" ADD CONSTRAINT "food_incident_batches_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "food_incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_incident_batches" ADD CONSTRAINT "food_incident_batches_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_incident_entries" ADD CONSTRAINT "food_incident_entries_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_incident_entries" ADD CONSTRAINT "food_incident_entries_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "food_incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_incident_entries" ADD CONSTRAINT "food_incident_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
