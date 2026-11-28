ALTER TYPE "AuthRateLimitAction" ADD VALUE 'QR_FEEDBACK_WINDOW';
ALTER TYPE "AuthRateLimitAction" ADD VALUE 'MENU_PHOTO_SCAN_WINDOW';

CREATE TABLE "qr_feedback" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "qr_feedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "qr_feedback_table_id_submission_id_key"
    ON "qr_feedback"("table_id", "submission_id");
CREATE INDEX "qr_feedback_restaurant_id_created_at_id_idx"
    ON "qr_feedback"("restaurant_id", "created_at" DESC, "id" DESC);

ALTER TABLE "qr_feedback" ADD CONSTRAINT "qr_feedback_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qr_feedback" ADD CONSTRAINT "qr_feedback_table_id_fkey"
    FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
