-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "customizations" JSONB NOT NULL DEFAULT '{"variants":[],"groups":[],"components":[]}';
