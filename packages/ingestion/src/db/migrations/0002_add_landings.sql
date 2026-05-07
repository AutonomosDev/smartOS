CREATE TABLE "landings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingest_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"operacion" text NOT NULL,
	"source_file" text NOT NULL,
	"gcs_uri" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"file_md5" text NOT NULL,
	"content_type" text,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "landings_ingest_id_idx" ON "landings" USING btree ("ingest_id");