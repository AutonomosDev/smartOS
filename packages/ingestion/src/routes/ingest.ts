import { Hono } from "hono";
import { ingestInventario } from "../services/ingest-inventario.js";

export const ingestRouter = new Hono();

ingestRouter.post("/inventario", async (c) => {
  const form = await c.req.parseBody();
  const file = form["file"];

  if (!(file instanceof File)) {
    return c.json(
      { error: "missing_file", detail: "Send xlsx as multipart field 'file'" },
      400
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sourceFile = file.name || "upload.xlsx";

  try {
    const result = await ingestInventario(buffer, sourceFile);
    return c.json(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.json({ error: "ingest_failed", detail: message }, 500);
  }
});
