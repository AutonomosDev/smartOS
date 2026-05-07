CREATE TABLE "animales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diio" text NOT NULL,
	"estado" text NOT NULL,
	"tipo_ganado" text,
	"fecha_nacimiento" date,
	"ultimo_peso_kg" numeric(6, 2),
	"ultimo_peso_at" date,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_file" text,
	CONSTRAINT "animales_diio_unique" UNIQUE("diio")
);
--> statement-breakpoint
CREATE TABLE "inventario_bronze" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ingest_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_file" text NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inventario_bronze_ingest_id_idx" ON "inventario_bronze" USING btree ("ingest_id");--> statement-breakpoint
CREATE INDEX "inventario_bronze_ingested_at_idx" ON "inventario_bronze" USING btree ("ingested_at");