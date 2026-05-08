import Anthropic from "@anthropic-ai/sdk";
import { pickModel, type RouteDecision } from "./router.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { CATTLE_TOOLS, executeTool } from "./tools.js";

const MAX_TURNS = 8;

export type ChatRequest = {
  messages: { role: "user" | "assistant"; content: string }[];
};

export type ToolCallTrace = {
  name: string;
  input: Record<string, unknown>;
  resultPreview: string;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
};

export type ChatResponse = {
  reply: string;
  toolCalls: ToolCallTrace[];
  turns: number;
  model: string;
  tier: RouteDecision["tier"];
  routeReason: string;
  stopReason: string;
  usage: Usage;
  cacheHit: boolean;
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY no está configurada. Agregar al .env y reiniciar."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

function previewResult(value: unknown): string {
  const json = JSON.stringify(value);
  if (json.length <= 240) return json;
  return json.slice(0, 237) + "...";
}

/**
 * Loop principal del agente. Multi-turn con tool use.
 * Termina cuando el modelo devuelve stop_reason="end_turn"
 * o se alcanza MAX_TURNS.
 */
export async function runAgent(req: ChatRequest): Promise<ChatResponse> {
  const anthropic = getClient();
  const toolCalls: ToolCallTrace[] = [];

  const messages: Anthropic.MessageParam[] = req.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let turns = 0;
  let stopReason = "max_turns";
  let finalText = "";
  const usage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
  };

  // Decisión de tier por la última pregunta del user
  const route = pickModel(req.messages);

  while (turns < MAX_TURNS) {
    turns += 1;

    const response = await anthropic.messages.create({
      model: route.model,
      max_tokens: 2048,
      // Prompt caching: system y último tool marcados como ephemeral.
      // Anthropic cachea esos bloques 5 min → 90% ahorro en hits.
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: CATTLE_TOOLS.map((t, i) =>
        i === CATTLE_TOOLS.length - 1
          ? { ...t, cache_control: { type: "ephemeral" as const } }
          : t
      ) as unknown as Anthropic.Tool[],
      messages,
    });

    stopReason = response.stop_reason ?? "unknown";
    usage.inputTokens += response.usage.input_tokens ?? 0;
    usage.outputTokens += response.usage.output_tokens ?? 0;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheCreateTokens += response.usage.cache_creation_input_tokens ?? 0;

    // Recolectar texto + tool_use de la respuesta
    const assistantBlocks: Anthropic.ContentBlock[] = response.content;
    messages.push({ role: "assistant", content: assistantBlocks });

    const textParts = assistantBlocks
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text);
    if (textParts.length > 0) {
      finalText = textParts.join("\n");
    }

    const toolUseBlocks = assistantBlocks.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0 || stopReason === "end_turn") {
      break;
    }

    // Ejecutar tools y agregar resultados como user message
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUseBlocks) {
      try {
        const result = await executeTool(
          tu.name,
          (tu.input ?? {}) as Record<string, unknown>
        );
        toolCalls.push({
          name: tu.name,
          input: (tu.input ?? {}) as Record<string, unknown>,
          resultPreview: previewResult(result),
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "tool_error";
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify({ error: message }),
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    reply: finalText || "(sin respuesta de texto)",
    toolCalls,
    turns,
    model: route.model,
    tier: route.tier,
    routeReason: route.reason,
    stopReason,
    usage,
    cacheHit: usage.cacheReadTokens > 0,
  };
}
