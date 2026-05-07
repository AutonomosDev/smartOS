CREATE TABLE "pesajes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diio" text NOT NULL,
	"fecha_pesaje" date NOT NULL,
	"peso_kg" numeric(6, 2) NOT NULL,
	"edad_meses" numeric(5, 1),
	"tipo_ganado" text,
	"estado_reproductivo" text,
	"ala_galpon" text,
	"corral" text,
	"observaciones" text,
	"creado_por" text,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_file" text
);
--> statement-breakpoint
CREATE TABLE "pesajes_bronze" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ingest_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_file" text NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pesajes_diio_fecha_idx" ON "pesajes" USING btree ("diio","fecha_pesaje");--> statement-breakpoint
CREATE INDEX "pesajes_diio_fecha_desc_idx" ON "pesajes" USING btree ("diio","fecha_pesaje");--> statement-breakpoint
CREATE INDEX "pesajes_ala_corral_idx" ON "pesajes" USING btree ("ala_galpon","corral");--> statement-breakpoint
CREATE INDEX "pesajes_bronze_ingest_id_idx" ON "pesajes_bronze" USING btree ("ingest_id");--> statement-breakpoint
CREATE INDEX "pesajes_bronze_ingested_at_idx" ON "pesajes_bronze" USING btree ("ingested_at");