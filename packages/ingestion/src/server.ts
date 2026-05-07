import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { TENANCY } from "./config/tenancy.js";
import { ingestRouter } from "./routes/ingest.js";

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    status: "ok",
    layer: "ingestion",
    version: "0.0.1",
    tenancy: TENANCY,
  })
);

app.route("/ingest", ingestRouter);

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`smartOS ingestion listening on :${info.port}`);
});
