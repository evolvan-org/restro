-- Runs before the captain-move migration on databases that have not applied it.
-- Keep a temporary copy on each reservation; the restoration migration removes it.
ALTER TABLE "reservations" ADD COLUMN "captain_user_id_before_move" UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'reservations' AND column_name = 'captain_user_id'
  ) THEN
    EXECUTE 'UPDATE "reservations" SET "captain_user_id_before_move" = "captain_user_id"';
  END IF;
END $$;
