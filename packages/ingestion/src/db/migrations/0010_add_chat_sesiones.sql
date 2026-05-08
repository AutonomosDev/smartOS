CREATE TABLE "chat_mensajes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sesion_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_create_tokens" integer,
	"cost_usd" text,
	"fingerprint" text,
	"cache_hit" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sesiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text,
	"user_id" text,
	"operacion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chat_mensajes" ADD CONSTRAINT "chat_mensajes_sesion_id_chat_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."chat_sesiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_mensajes_sesion_id_idx" ON "chat_mensajes" USING btree ("sesion_id");--> statement-breakpoint
CREATE INDEX "chat_mensajes_created_at_idx" ON "chat_mensajes" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_mensajes_fingerprint_idx" ON "chat_mensajes" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "chat_sesiones_user_id_idx" ON "chat_sesiones" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_sesiones_updated_at_idx" ON "chat_sesiones" USING btree ("updated_at");