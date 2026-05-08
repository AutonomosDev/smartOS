import { sql } from "drizzle-orm";
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Sesión de chat — 1 fila por conversación.
 * Multi-turn vive como filas en chat_mensajes (FK).
 */
export const chatSesiones = pgTable(
  "chat_sesiones",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    titulo: text("titulo"),                  // generado por LLM o manual
    userId: text("user_id"),                  // por ahora libre, capa 7 lo amarra a auth
    operacion: text("operacion"),             // contexto multi-tenant futuro
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("chat_sesiones_user_id_idx").on(t.userId),
    index("chat_sesiones_updated_at_idx").on(t.updatedAt),
  ]
);

export type ChatSesion = typeof chatSesiones.$inferSelect;
export type NewChatSesion = typeof chatSesiones.$inferInsert;

/**
 * Mensaje individual de un turno. Append-only.
 * `tool_calls` y `tool_results` son arrays jsonb para audit.
 * `usage` y `cost_usd` permiten facturación.
 */
export const chatMensajes = pgTable(
  "chat_mensajes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sesionId: uuid("sesion_id")
      .notNull()
      .references(() => chatSesiones.id, { onDelete: "cascade" }),
    role: text("role").notNull(),             // 'user' | 'assistant'
    content: text("content").notNull(),

    // Trace LLM (sólo en messages assistant)
    toolCalls: jsonb("tool_calls"),           // [{name, input, resultPreview}]
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheCreateTokens: integer("cache_create_tokens"),
    costUsd: text("cost_usd"),                // numeric stored as text

    // Cache hit hints (Fase 4)
    fingerprint: text("fingerprint"),         // md5(content + sesion + tools)
    cacheHit: text("cache_hit"),              // 'app' | 'anthropic' | null

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chat_mensajes_sesion_id_idx").on(t.sesionId),
    index("chat_mensajes_created_at_idx").on(t.createdAt),
    uniqueIndex("chat_mensajes_fingerprint_idx").on(t.fingerprint),
  ]
);

export type ChatMensaje = typeof chatMensajes.$inferSelect;
export type NewChatMensaje = typeof chatMensajes.$inferInsert;
