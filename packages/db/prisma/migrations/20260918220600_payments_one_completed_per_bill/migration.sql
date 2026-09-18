-- One COMPLETED settlement per bill (review finding H6).
-- Prisma cannot express partial unique indexes in the schema, so it lives here.
CREATE UNIQUE INDEX "payments_one_completed_per_bill"
  ON "payments" ("bill_id")
  WHERE "status" = 'COMPLETED';
