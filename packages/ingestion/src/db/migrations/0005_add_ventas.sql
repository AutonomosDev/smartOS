CREATE TABLE "ventas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero_venta" integer NOT NULL,
	"fecha_venta" date NOT NULL,
	"cantidad_animales" integer,
	"cantidad_pesados" integer,
	"peso_total_kg" numeric(10, 2),
	"tipo_ganado_resumen" text,
	"estado" text,
	"observaciones" text,
	"creado_por" text,
	"fecha_creado_sistema" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_file" text
);
--> statement-breakpoint
CREATE TABLE "ventas_animales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"numero_venta" integer NOT NULL,
	"diio" text NOT NULL,
	"tipo_ganado" text,
	"estado_reproductivo" text,
	"estado_leche" text,
	"peso_kg" numeric(7, 2),
	"mangada" integer,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_file" text
);
--> statement-breakpoint
CREATE TABLE "ventas_animales_bronze" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ingest_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_file" text NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ventas_bronze" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ingest_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source_file" text NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ventas_animales" ADD CONSTRAINT "ventas_animales_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_numero_venta_idx" ON "ventas" USING btree ("numero_venta");--> statement-breakpoint
CREATE INDEX "ventas_fecha_idx" ON "ventas" USING btree ("fecha_venta");--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_animales_venta_diio_idx" ON "ventas_animales" USING btree ("venta_id","diio");--> statement-breakpoint
CREATE INDEX "ventas_animales_diio_idx" ON "ventas_animales" USING btree ("diio");--> statement-breakpoint
CREATE INDEX "ventas_animales_numero_venta_idx" ON "ventas_animales" USING btree ("numero_venta");--> statement-breakpoint
CREATE INDEX "ventas_animales_bronze_ingest_id_idx" ON "ventas_animales_bronze" USING btree ("ingest_id");--> statement-breakpoint
CREATE INDEX "ventas_animales_bronze_ingested_at_idx" ON "ventas_animales_bronze" USING btree ("ingested_at");--> statement-breakpoint
CREATE INDEX "ventas_bronze_ingest_id_idx" ON "ventas_bronze" USING btree ("ingest_id");--> statement-breakpoint
CREATE INDEX "ventas_bronze_ingested_at_idx" ON "ventas_bronze" USING btree ("ingested_at");