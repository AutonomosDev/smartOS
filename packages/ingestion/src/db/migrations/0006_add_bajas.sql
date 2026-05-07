CREATE TABLE "bajas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diio" text NOT NULL,
	"fecha_baja" date NOT NULL,
	"motivo" text,
	"detalle" text,
	"tipo_ganado" text,
	"fecha_nacimiento" date,
	"estado_reproductivo" text,
	"observaciones" text,
	"creado_por" text,
	"fecha_creado_sistema" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_file" text
);
--> statement-breakpoint
CREATE TABLE "bajas_bronze" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ingest_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_file" text NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bajas_diio_idx" ON "bajas" USING btree ("diio");--> statement-breakpoint
CREATE INDEX "bajas_fecha_idx" ON "bajas" USING btree ("fecha_baja");--> statement-breakpoint
CREATE INDEX "bajas_motivo_idx" ON "bajas" USING btree ("motivo");--> statement-breakpoint
CREATE INDEX "bajas_bronze_ingest_id_idx" ON "bajas_bronze" USING btree ("ingest_id");--> statement-breakpoint
CREATE INDEX "bajas_bronze_ingested_at_idx" ON "bajas_bronze" USING btree ("ingested_at");