CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sesion_id" uuid,
	"tool_name" text NOT NULL,
	"input" jsonb NOT NULL,
	"dry_run" boolean NOT NULL,
	"user_confirmed" boolean DEFAULT false NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"error_detail" text,
	"required_role" text,
	"caller_role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_sesion_id_chat_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."chat_sesiones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_actions_idempotency_idx" ON "agent_actions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_actions_sesion_id_idx" ON "agent_actions" USING btree ("sesion_id");--> statement-breakpoint
CREATE INDEX "agent_actions_tool_name_idx" ON "agent_actions" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "agent_actions_created_at_idx" ON "agent_actions" USING btree ("created_at");