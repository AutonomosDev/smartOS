import { Hono } from "hono";
import { ingestBajas } from "../services/ingest-bajas.js";
import { ingestInventario } from "../services/ingest-inventario.js";
import { ingestPesajes } from "../services/ingest-pesajes.js";
import { ingestTratamientos } from "../services/ingest-tratamientos.js";
import {
  ingestVentasCabecera,
  ingestVentasDetalle,
} from "../services/ingest-ventas.js";

export const ingestRouter = new Hono();

async function readMultipartFile(
  parsedBody: Record<string, unknown>
): Promise<{ buffer: Buffer; name: string } | null> {
  const file = parsedBody["file"];
  if (!(file instanceof File)) return null;
  const buffer = Buffer.from(await file.arrayBuffer());
  return { buffer, name: file.name || "upload.xlsx" };
}

ingestRouter.post("/inventario", async (c) => {
  const form = await c.req.parseBody();
  const file = await readMultipartFile(form);
  if (!file) {
    return c.json(
      { error: "missing_file", detail: "Send xlsx as multipart field 'file'" },
      400
    );
  }

  try {
    const result = await ingestInventario(file.buffer, file.name);
    return c.json(result, 200);
  } catch (err) {
    console.error("[ingest_inventario_failed]", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.json({ error: "ingest_failed", detail: message }, 500);
  }
});

ingestRouter.post("/pesajes", async (c) => {
  const form = await c.req.parseBody();
  const file = await readMultipartFile(form);
  if (!file) {
    return c.json(
      { error: "missing_file", detail: "Send xlsx as multipart field 'file'" },
      400
    );
  }

  try {
    const result = await ingestPesajes(file.buffer, file.name);
    return c.json(result, 200);
  } catch (err) {
    console.error("[ingest_pesajes_failed]", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.json({ error: "ingest_failed", detail: message }, 500);
  }
});

ingestRouter.post("/tratamientos", async (c) => {
  const form = await c.req.parseBody();
  const file = await readMultipartFile(form);
  if (!file) {
    return c.json(
      { error: "missing_file", detail: "Send xlsx as multipart field 'file'" },
      400
    );
  }

  try {
    const result = await ingestTratamientos(file.buffer, file.name);
    return c.json(result, 200);
  } catch (err) {
    console.error("[ingest_tratamientos_failed]", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.json({ error: "ingest_failed", detail: message }, 500);
  }
});

ingestRouter.post("/ventas", async (c) => {
  const form = await c.req.parseBody();
  const file = await readMultipartFile(form);
  if (!file) {
    return c.json(
      { error: "missing_file", detail: "Send xlsx as multipart field 'file'" },
      400
    );
  }

  try {
    const result = await ingestVentasCabecera(file.buffer, file.name);
    return c.json(result, 200);
  } catch (err) {
    console.error("[ingest_ventas_failed]", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.json({ error: "ingest_failed", detail: message }, 500);
  }
});

ingestRouter.post("/bajas", async (c) => {
  const form = await c.req.parseBody();
  const file = await readMultipartFile(form);
  if (!file) {
    return c.json(
      { error: "missing_file", detail: "Send xlsx as multipart field 'file'" },
      400
    );
  }

  try {
    const result = await ingestBajas(file.buffer, file.name);
    return c.json(result, 200);
  } catch (err) {
    console.error("[ingest_bajas_failed]", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.json({ error: "ingest_failed", detail: message }, 500);
  }
});

ingestRouter.post("/ventas-detalle", async (c) => {
  const form = await c.req.parseBody();
  const file = await readMultipartFile(form);
  if (!file) {
    return c.json(
      { error: "missing_file", detail: "Send xlsx as multipart field 'file'" },
      400
    );
  }

  try {
    const result = await ingestVentasDetalle(file.buffer, file.name);
    return c.json(result, 200);
  } catch (err) {
    console.error("[ingest_ventas_detalle_failed]", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.json(
      {
        error: "ingest_failed",
        detail: message,
        hint: message.includes("ventas_padre_faltantes")
          ? "Subir primero el archivo Ventas_Historial vía POST /ingest/ventas"
          : undefined,
      },
      400
    );
  }
});
