import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { CATTLE_TOOLS, executeTool } from "./tools.js";

const MODEL = process.env.SMARTOS_CHAT_MODEL ?? "claude-sonnet-4-5";
const MAX_TURNS = 8;

export type ChatRequest = {
  messages: { role: "user" | "assistant"; content: string }[];
};

/** Eventos que emite el stream al cliente (formato SSE). */
export type StreamEvent =
  | { type: "turn_start"; turn: number }
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; name: string; resultPreview: string }
  | {
      type: "done";
      turns: number;
      stopReason: string;
      model: string;
    }
  | { type: "error"; detail: string };

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");
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
 * Loop streaming. Emite eventos vía callback.
 * El callback debe ser async para escribir SSE de forma ordenada.
 */
export async function runAgentStream(
  req: ChatRequest,
  emit: (event: StreamEvent) => Promise<void>
): Promise<void> {
  let anthropic: Anthropic;
  try {
    anthropic = getClient();
  } catch (err) {
    await emit({
      type: "error",
      detail: err instanceof Error ? err.message : "init_failed",
    });
    return;
  }

  const messages: Anthropic.MessageParam[] = req.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let turns = 0;
  let stopReason = "max_turns";

  while (turns < MAX_TURNS) {
    turns += 1;
    await emit({ type: "turn_start", turn: turns });

    let assistantBlocks: Anthropic.ContentBlock[];
    try {
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: 2048,
        // Prompt caching: system + último tool ephemeral.
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

      // Emitir text deltas en vivo
      stream.on("text", (text) => {
        // intencionalmente sync; el await lo hacemos a la espera del stream
        void emit({ type: "text_delta", text });
      });

      const finalMsg = await stream.finalMessage();
      assistantBlocks = finalMsg.content;
      stopReason = finalMsg.stop_reason ?? "unknown";
    } catch (err) {
      await emit({
        type: "error",
        detail: err instanceof Error ? err.message : "model_error",
      });
      return;
    }

    messages.push({ role: "assistant", content: assistantBlocks });

    const toolUseBlocks = assistantBlocks.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0 || stopReason === "end_turn") {
      break;
    }

    // Ejecutar tools y emitir trace
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUseBlocks) {
      const input = (tu.input ?? {}) as Record<string, unknown>;
      await emit({ type: "tool_call", name: tu.name, input });
      try {
        const result = await executeTool(tu.name, input);
        const preview = previewResult(result);
        await emit({ type: "tool_result", name: tu.name, resultPreview: preview });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "tool_error";
        await emit({
          type: "tool_result",
          name: tu.name,
          resultPreview: `error: ${message}`,
        });
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

  await emit({ type: "done", turns, stopReason, model: MODEL });
}
