-- Keep the two veg markers in step after REST-88 (menu_items.is_veg, guest menu) and REST-89
-- (menu_items.diet_type, veg / non-veg / egg) met. Hand-written data move; new writes keep them
-- in step in the API. Egg counts as non-veg for the FSSAI marker.
UPDATE "menu_items" SET "diet_type" = 'VEG' WHERE "diet_type" IS NULL AND "is_veg" = TRUE;
UPDATE "menu_items" SET "diet_type" = 'NON_VEG' WHERE "diet_type" IS NULL AND "is_veg" = FALSE;
UPDATE "menu_items" SET "is_veg" = ("diet_type" = 'VEG') WHERE "is_veg" IS NULL AND "diet_type" IS NOT NULL;
