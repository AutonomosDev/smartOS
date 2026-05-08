import { createHash } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@smartos/ingestion";
import { chatMensajes, chatSesiones } from "@smartos/ingestion";
import { runAgent, type Usage } from "../agent/run.js";

// Precios sonnet-4-5 (USD por millón de tokens)
const PRICE = {
  input: 3.0,
  output: 15.0,
  cacheRead: 0.3,
  cacheCreate: 3.75,
} as const;

function calcCostUsd(u: Usage): number {
  return (
    (u.inputTokens * PRICE.input +
      u.outputTokens * PRICE.output +
      u.cacheReadTokens * PRICE.cacheRead +
      u.cacheCreateTokens * PRICE.cacheCreate) /
    1_000_000
  );
}

function fingerprint(content: string, sesionId: string): string {
  return createHash("md5")
    .update(`${sesionId}|${content.trim().toLowerCase()}`)
    .digest("hex");
}

export type CreateSesionInput = {
  titulo?: string;
  userId?: string;
  operacion?: string;
};

export async function createSesion(input: CreateSesionInput = {}) {
  const [s] = await db
    .insert(chatSesiones)
    .values({
      titulo: input.titulo ?? null,
      userId: input.userId ?? null,
      operacion: input.operacion ?? null,
    })
    .returning();
  return s!;
}

export async function listSesiones(userId?: string) {
  const where = userId
    ? and(eq(chatSesiones.userId, userId), isNull(chatSesiones.archivedAt))
    : isNull(chatSesiones.archivedAt);
  return await db
    .select()
    .from(chatSesiones)
    .where(where)
    .orderBy(desc(chatSesiones.updatedAt))
    .limit(50);
}

export async function getSesion(id: string) {
  const r = await db
    .select()
    .from(chatSesiones)
    .where(eq(chatSesiones.id, id))
    .limit(1);
  return r[0] ?? null;
}

export async function getMensajes(sesionId: string) {
  return await db
    .select()
    .from(chatMensajes)
    .where(eq(chatMensajes.sesionId, sesionId))
    .orderBy(chatMensajes.createdAt);
}

export async function archivarSesion(id: string) {
  await db
    .update(chatSesiones)
    .set({ archivedAt: new Date() })
    .where(eq(chatSesiones.id, id));
}

/**
 * Envía un mensaje del user a una sesión.
 * Carga history desde DB → llama al agent → persiste user + assistant.
 *
 * Cache app-level (Fase 4):
 *   antes de llamar al LLM, busca un fingerprint identical
 *   en chat_mensajes role=assistant. Si existe < 5 min →
 *   responde con esa respuesta cacheada, marca cacheHit=app.
 */
export type EnviarMensajeResult = {
  sesionId: string;
  user: { id: number; content: string };
  assistant: {
    id: number;
    content: string;
    cacheHit: "app" | "anthropic" | null;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    model: string;
    toolCalls: { name: string; input: Record<string, unknown> }[];
    turns: number;
  };
};

export async function enviarMensaje(
  sesionId: string,
  content: string
): Promise<EnviarMensajeResult> {
  const sesion = await getSesion(sesionId);
  if (!sesion) throw new Error(`sesion_not_found: ${sesionId}`);

  const fp = fingerprint(content, sesionId);

  // Cache app-level: busca respuesta idéntica reciente (5 min)
  const cached = await db.execute<{
    id: number;
    content: string;
    model: string | null;
  }>(sql`
    SELECT id, content, model
    FROM chat_mensajes
    WHERE fingerprint = ${fp}
      AND role = 'assistant'
      AND created_at > now() - INTERVAL '5 minutes'
    ORDER BY created_at DESC LIMIT 1
  `);

  // Persistir user message
  const [userMsg] = await db
    .insert(chatMensajes)
    .values({
      sesionId,
      role: "user",
      content,
      fingerprint: null, // user messages no se cachean por sí solas
    })
    .returning({ id: chatMensajes.id, content: chatMensajes.content });

  if (cached.rows[0]) {
    // Cache hit app-level: persiste assistant message como cache hit
    const [assistantMsg] = await db
      .insert(chatMensajes)
      .values({
        sesionId,
        role: "assistant",
        content: cached.rows[0].content,
        model: cached.rows[0].model,
        fingerprint: null, // ya cacheado, no lo dupliques al cache
        cacheHit: "app",
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        costUsd: "0",
      })
      .returning();

    // Update sesion timestamp
    await db
      .update(chatSesiones)
      .set({ updatedAt: new Date() })
      .where(eq(chatSesiones.id, sesionId));

    return {
      sesionId,
      user: userMsg!,
      assistant: {
        id: assistantMsg!.id,
        content: assistantMsg!.content,
        cacheHit: "app",
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        model: assistantMsg!.model ?? "cache",
        toolCalls: [],
        turns: 0,
      },
    };
  }

  // Cache miss: cargar history y llamar al agent
  const historyRows = await getMensajes(sesionId);
  const history = historyRows
    .filter((m) => m.id !== userMsg!.id) // excluir el user que recién insertamos
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  history.push({ role: "user", content });

  const result = await runAgent({ messages: history });
  const cost = calcCostUsd(result.usage);
  const cacheHit: "anthropic" | null = result.cacheHit ? "anthropic" : null;

  const [assistantMsg] = await db
    .insert(chatMensajes)
    .values({
      sesionId,
      role: "assistant",
      content: result.reply,
      model: result.model,
      fingerprint: fp,
      cacheHit,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheCreateTokens: result.usage.cacheCreateTokens,
      costUsd: cost.toFixed(6),
      toolCalls: result.toolCalls.map((tc) => ({
        name: tc.name,
        input: tc.input,
        resultPreview: tc.resultPreview,
      })),
    })
    .returning();

  await db
    .update(chatSesiones)
    .set({ updatedAt: new Date() })
    .where(eq(chatSesiones.id, sesionId));

  return {
    sesionId,
    user: userMsg!,
    assistant: {
      id: assistantMsg!.id,
      content: result.reply,
      cacheHit,
      costUsd: cost,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      model: result.model,
      toolCalls: result.toolCalls.map((tc) => ({
        name: tc.name,
        input: tc.input,
      })),
      turns: result.turns,
    },
  };
}
