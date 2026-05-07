import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { TENANCY } from "./config/tenancy.js";
import { adminRouter } from "./routes/admin.js";
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
app.route("/admin", adminRouter);

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`smartOS ingestion listening on :${info.port}`);
});
