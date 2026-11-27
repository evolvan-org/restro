-- CreateTable
CREATE TABLE "thermal_printers" (
    "restaurant_id" UUID NOT NULL,
    "destination" VARCHAR(10) NOT NULL,
    "connection" VARCHAR(10) NOT NULL,
    "network_host" VARCHAR(15),
    "network_port" INTEGER,
    "paper" VARCHAR(2) NOT NULL,
    "code_page" VARCHAR(8) NOT NULL,
    "columns" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "thermal_printers_pkey" PRIMARY KEY ("restaurant_id","destination")
);

-- AddForeignKey
ALTER TABLE "thermal_printers" ADD CONSTRAINT "thermal_printers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
