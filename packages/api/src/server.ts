import { serve } from "@hono/node-server";
import { Hono } from "hono";
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

app.route("/api/v1", v1Router);
app.route("/chat", chatRouter);
app.route("/chat/stream", chatStreamRouter);
app.route("/chat/sesiones", sesionesRouter);
app.route("/agent/actions", agentActionsRouter);

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
