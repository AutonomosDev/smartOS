import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { chatRouter } from "./routes/chat.js";
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
});
