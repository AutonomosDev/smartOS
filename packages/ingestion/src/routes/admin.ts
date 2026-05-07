import { Hono } from "hono";
import { buildConsistenciaReport } from "../services/consistencia.js";

export const adminRouter = new Hono();

adminRouter.get("/consistencia", async (c) => {
  try {
    const report = await buildConsistenciaReport();
    return c.json(report, 200);
  } catch (err) {
    console.error("[consistencia_failed]", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.json({ error: "consistencia_failed", detail: message }, 500);
  }
});
