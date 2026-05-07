CREATE TABLE "tratamientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diio" text NOT NULL,
	"fecha_tratamiento" date NOT NULL,
	"diagnostico" text,
	"medicamento_nombre" text,
	"medicamento_sag" text,
	"medicamento_raw" text,
	"serie" text,
	"vencimiento" date,
	"via" text,
	"dosis_raw" text,
	"dosis_ml" numeric(8, 2),
	"repetir_cada_dias" numeric(5, 2),
	"repetir_veces" integer,
	"inicio" date,
	"fin" date,
	"resguardo_leche_dias" integer,
	"resguardo_carne_dias" integer,
	"liberacion_leche" date,
	"liberacion_carne" date,
	"observaciones" text,
	"creado_por" text,
	"fecha_creado_sistema" timestamp with time zone,
	"content_hash" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_file" text
);
--> statement-breakpoint
CREATE TABLE "tratamientos_bronze" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ingest_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_file" text NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tratamientos_content_hash_idx" ON "tratamientos" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "tratamientos_diio_fecha_desc_idx" ON "tratamientos" USING btree ("diio","fecha_tratamiento");--> statement-breakpoint
CREATE INDEX "tratamientos_liberacion_carne_idx" ON "tratamientos" USING btree ("liberacion_carne");--> statement-breakpoint
CREATE INDEX "tratamientos_liberacion_leche_idx" ON "tratamientos" USING btree ("liberacion_leche");--> statement-breakpoint
CREATE INDEX "tratamientos_medicamento_sag_idx" ON "tratamientos" USING btree ("medicamento_sag");--> statement-breakpoint
CREATE INDEX "tratamientos_bronze_ingest_id_idx" ON "tratamientos_bronze" USING btree ("ingest_id");--> statement-breakpoint
CREATE INDEX "tratamientos_bronze_ingested_at_idx" ON "tratamientos_bronze" USING btree ("ingested_at");