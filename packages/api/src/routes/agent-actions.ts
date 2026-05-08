import { Hono } from "hono";
import { z } from "zod";
import { executeWriteTool } from "../services/agent-actions.js";

export const agentActionsRouter = new Hono();

const ExecuteSchema = z.object({
  toolName: z.string(),
  input: z.record(z.unknown()),
  dryRun: z.boolean().optional(),
  idempotencyKey: z.string().optional(),
  sesionId: z.string().optional(),
  userConfirmed: z.boolean().optional(),
  callerRole: z.string().optional(),
  doubleConfirm: z.boolean().optional(),
});

agentActionsRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = ExecuteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", detail: parsed.error.errors }, 400);
  }

  try {
    const result = await executeWriteTool(parsed.data);
    const statusCode = result.status === "needs_confirmation" ? 409 : 200;
    return c.json(result, statusCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    if (message.startsWith("unknown_tool")) {
      return c.json({ error: "unknown_tool", detail: message }, 404);
    }
    if (message.startsWith("forbidden")) {
      return c.json({ error: "forbidden", detail: message }, 403);
    }
    console.error("[agent_action_failed]", err);
    return c.json({ error: "action_failed", detail: message }, 500);
  }
});
