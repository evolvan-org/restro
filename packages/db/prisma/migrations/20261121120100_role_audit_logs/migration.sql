-- REST-79: audit trail for role and permission changes.
-- Reverse: DROP TABLE "role_audit_logs"; DROP TYPE "RoleAuditAction";

-- CreateEnum
CREATE TYPE "RoleAuditAction" AS ENUM ('CREATED', 'UPDATED', 'RESET', 'DELETED');

-- CreateTable
CREATE TABLE "role_audit_logs" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "role_name" VARCHAR(100) NOT NULL,
    "actor_user_id" UUID,
    "action" "RoleAuditAction" NOT NULL,
    "added_keys" TEXT[],
    "removed_keys" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_audit_logs_restaurant_id_created_at_idx" ON "role_audit_logs"("restaurant_id", "created_at");

-- AddForeignKey
ALTER TABLE "role_audit_logs" ADD CONSTRAINT "role_audit_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_audit_logs" ADD CONSTRAINT "role_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
