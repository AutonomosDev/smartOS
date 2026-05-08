import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { runAgentStream } from "../agent/run-stream.js";

export const chatStreamRouter = new Hono();

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
});

chatStreamRouter.post("/", async (c) => {
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

  return streamSSE(c, async (stream) => {
    let id = 0;
    await runAgentStream(parsed.data, async (event) => {
      id += 1;
      await stream.writeSSE({
        id: String(id),
        event: event.type,
        data: JSON.stringify(event),
      });
    });
  });
});
