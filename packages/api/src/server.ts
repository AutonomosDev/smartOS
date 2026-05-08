import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { requireAuth } from "./middleware/auth.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { agentActionsRouter } from "./routes/agent-actions.js";
import { chatRouter } from "./routes/chat.js";
import { chatStreamRouter } from "./routes/chat-stream.js";
import { sesionesRouter } from "./routes/sesiones.js";
import { v1Router } from "./routes/v1.js";

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    layer: "ontology+brains",
    package: "@smartos/api",
    version: "0.0.1",
    chatEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
  })
);

// Capa 7 — middlewares de governance
//   - rateLimit aplica a TODOS los endpoints (incluido /api/v1)
//   - requireAuth aplica solo a endpoints que pueden mutar
//     o que generan costo LLM
app.use("*", rateLimit({ scope: "global", limit: 120 }));

app.route("/api/v1", v1Router);

// Endpoints que generan costo LLM o mutaciones → requieren auth
const protectedChatRoutes = new Hono();
protectedChatRoutes.use("*", requireAuth);
protectedChatRoutes.use("*", rateLimit({ scope: "chat", limit: 30 }));
protectedChatRoutes.route("/", chatRouter);
app.route("/chat", protectedChatRoutes);

const protectedStreamRoutes = new Hono();
protectedStreamRoutes.use("*", requireAuth);
protectedStreamRoutes.use("*", rateLimit({ scope: "chat-stream", limit: 30 }));
protectedStreamRoutes.route("/", chatStreamRouter);
app.route("/chat/stream", protectedStreamRoutes);

const protectedSesionesRoutes = new Hono();
protectedSesionesRoutes.use("*", requireAuth);
protectedSesionesRoutes.use("*", rateLimit({ scope: "sesiones", limit: 60 }));
protectedSesionesRoutes.route("/", sesionesRouter);
app.route("/chat/sesiones", protectedSesionesRoutes);

const protectedActionsRoutes = new Hono();
protectedActionsRoutes.use("*", requireAuth);
protectedActionsRoutes.use("*", rateLimit({ scope: "actions", limit: 30 }));
protectedActionsRoutes.route("/", agentActionsRouter);
app.route("/agent/actions", protectedActionsRoutes);

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`smartOS API listening on :${info.port}`);
  console.log(`  GET  /health`);
  console.log(`  GET  /api/v1/animales`);
  console.log(`  GET  /api/v1/animales/:diio`);
  console.log(`  GET  /api/v1/proveedores`);
  console.log(`  GET  /api/v1/ventas`);
  console.log(`  GET  /api/v1/alarmas/resguardo-carne`);
  console.log(`  GET  /api/v1/dashboard`);
  console.log(`  POST /chat`);
  console.log(`  POST /chat/stream  (SSE)`);
  console.log(`  POST /chat/sesiones`);
  console.log(`  GET  /chat/sesiones`);
  console.log(`  POST /chat/sesiones/:id/mensajes  (multi-turn + cache)`);
  console.log(`  POST /agent/actions  (mutations con dry-run + audit)`);
});
