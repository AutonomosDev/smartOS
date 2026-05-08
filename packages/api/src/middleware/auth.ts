import type { MiddlewareHandler } from "hono";

/**
 * Auth middleware — Bearer token simple (MVP).
 *
 * Si SMARTOS_API_TOKEN está seteada en env, exige
 * `Authorization: Bearer <token>` en el request.
 *
 * Si no está seteada, deja pasar (modo dev local).
 *
 * Capa 7 completa eventualmente reemplazará esto con
 * Clerk/Auth0 + JWT + roles. Por ahora es el guardrail
 * mínimo para que /chat y /agent/actions no estén
 * abiertos al mundo.
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const expected = process.env.SMARTOS_API_TOKEN;

  // Modo dev: sin token configurado, pasa
  if (!expected) {
    await next();
    return;
  }

  const header = c.req.header("Authorization");
  if (!header) {
    return c.json({ error: "unauthorized", detail: "missing_authorization_header" }, 401);
  }

  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) {
    return c.json({ error: "unauthorized", detail: "invalid_authorization_format" }, 401);
  }

  const token = (m[1] ?? "").trim();
  if (token !== expected) {
    return c.json({ error: "unauthorized", detail: "invalid_token" }, 401);
  }

  await next();
};
