import { Hono } from "hono";
import { z } from "zod";
import { runAgent } from "../agent/run.js";

export const chatRouter = new Hono();

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
});

chatRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_request", detail: parsed.error.errors },
      400
    );
  }

  try {
    const result = await runAgent(parsed.data);
    return c.json(result, 200);
  } catch (err) {
    console.error("[chat_failed]", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.json({ error: "chat_failed", detail: message }, 500);
  }
});
