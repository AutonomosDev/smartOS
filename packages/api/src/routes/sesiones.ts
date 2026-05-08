import { Hono } from "hono";
import { z } from "zod";
import {
  archivarSesion,
  createSesion,
  enviarMensaje,
  getMensajes,
  getSesion,
  listSesiones,
} from "../services/sesiones.js";

export const sesionesRouter = new Hono();

const CreateSchema = z.object({
  titulo: z.string().optional(),
  userId: z.string().optional(),
  operacion: z.string().optional(),
});

sesionesRouter.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", detail: parsed.error.errors }, 400);
  }
  const s = await createSesion(parsed.data);
  return c.json(s, 201);
});

sesionesRouter.get("/", async (c) => {
  const userId = c.req.query("userId");
  return c.json(await listSesiones(userId));
});

sesionesRouter.get("/:id", async (c) => {
  const s = await getSesion(c.req.param("id"));
  if (!s) return c.json({ error: "not_found" }, 404);
  return c.json(s);
});

sesionesRouter.get("/:id/mensajes", async (c) => {
  return c.json(await getMensajes(c.req.param("id")));
});

sesionesRouter.delete("/:id", async (c) => {
  await archivarSesion(c.req.param("id"));
  return c.json({ ok: true });
});

const MensajeSchema = z.object({ content: z.string().min(1) });

sesionesRouter.post("/:id/mensajes", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = MensajeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", detail: parsed.error.errors }, 400);
  }

  try {
    const result = await enviarMensaje(c.req.param("id"), parsed.data.content);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    if (message.startsWith("sesion_not_found")) {
      return c.json({ error: "sesion_not_found" }, 404);
    }
    console.error("[sesiones_mensaje_failed]", err);
    return c.json({ error: "mensaje_failed", detail: message }, 500);
  }
});
