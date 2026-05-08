import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { chatSesiones } from "./chat-sesiones.js";

/**
 * Audit log de TODAS las acciones de mutation del agente.
 *
 * Reglas:
 *   • Append-only en práctica (nunca DELETE)
 *   • UPDATE solo permitido pending → success/error
 *     (manejado en código, no por trigger)
 *   • idempotency_key UNIQUE → retry no re-ejecuta
 *   • Compliance SAG: trazabilidad completa
 */
export const agentActions = pgTable(
  "agent_actions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sesionId: uuid("sesion_id").references(() => chatSesiones.id, {
      onDelete: "set null",
    }),

    // Identificación de la acción
    toolName: text("tool_name").notNull(),
    input: jsonb("input").notNull(),

    // Modo + confirmación
    dryRun: boolean("dry_run").notNull(),
    userConfirmed: boolean("user_confirmed").notNull().default(false),

    // Idempotencia
    idempotencyKey: text("idempotency_key").notNull(),

    // Resultado
    status: text("status").notNull().default("pending"), // pending | success | error
    result: jsonb("result"),
    errorDetail: text("error_detail"),

    // Trazabilidad
    requiredRole: text("required_role"),
    callerRole: text("caller_role"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("agent_actions_idempotency_idx").on(t.idempotencyKey),
    index("agent_actions_sesion_id_idx").on(t.sesionId),
    index("agent_actions_tool_name_idx").on(t.toolName),
    index("agent_actions_created_at_idx").on(t.createdAt),
  ]
);

export type AgentAction = typeof agentActions.$inferSelect;
export type NewAgentAction = typeof agentActions.$inferInsert;
