import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireAuth } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";

describe("requireAuth middleware", () => {
  beforeEach(() => {
    delete process.env.SMARTOS_API_TOKEN;
  });
  afterEach(() => {
    delete process.env.SMARTOS_API_TOKEN;
  });

  it("modo dev (sin token configurado) → pasa todo", async () => {
    const app = new Hono();
    app.use("*", requireAuth);
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.request("/");
    expect(res.status).toBe(200);
  });

  it("token configurado, sin header → 401", async () => {
    process.env.SMARTOS_API_TOKEN = "secret123";
    const app = new Hono();
    app.use("*", requireAuth);
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.request("/");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toBe("missing_authorization_header");
  });

  it("formato inválido → 401", async () => {
    process.env.SMARTOS_API_TOKEN = "secret123";
    const app = new Hono();
    app.use("*", requireAuth);
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.request("/", {
      headers: { Authorization: "Basic xyz" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toBe("invalid_authorization_format");
  });

  it("token incorrecto → 401", async () => {
    process.env.SMARTOS_API_TOKEN = "secret123";
    const app = new Hono();
    app.use("*", requireAuth);
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.request("/", {
      headers: { Authorization: "Bearer wrongtoken" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toBe("invalid_token");
  });

  it("token correcto → pasa", async () => {
    process.env.SMARTOS_API_TOKEN = "secret123";
    const app = new Hono();
    app.use("*", requireAuth);
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.request("/", {
      headers: { Authorization: "Bearer secret123" },
    });
    expect(res.status).toBe(200);
  });
});

describe("rateLimit middleware", () => {
  it("permite hasta el límite", async () => {
    const app = new Hono();
    app.use("*", rateLimit({ limit: 3, windowMs: 60_000, scope: "test1" }));
    app.get("/", (c) => c.json({ ok: true }));

    for (let i = 0; i < 3; i++) {
      const res = await app.request("/", {
        headers: { "x-real-ip": "1.2.3.4" },
      });
      expect(res.status).toBe(200);
    }
  });

  it("rechaza al pasar el límite con 429", async () => {
    const app = new Hono();
    app.use("*", rateLimit({ limit: 2, windowMs: 60_000, scope: "test2" }));
    app.get("/", (c) => c.json({ ok: true }));

    const ip = { headers: { "x-real-ip": "5.6.7.8" } };
    await app.request("/", ip);
    await app.request("/", ip);
    const res = await app.request("/", ip);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const body = (await res.json()) as { error: string; retryAfterSec: number };
    expect(body.error).toBe("rate_limit_exceeded");
    expect(body.retryAfterSec).toBeGreaterThan(0);
  });

  it("IPs distintas no se afectan entre sí", async () => {
    const app = new Hono();
    app.use("*", rateLimit({ limit: 1, windowMs: 60_000, scope: "test3" }));
    app.get("/", (c) => c.json({ ok: true }));

    const r1 = await app.request("/", { headers: { "x-real-ip": "10.0.0.1" } });
    const r2 = await app.request("/", { headers: { "x-real-ip": "10.0.0.2" } });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it("scopes distintos no se afectan", async () => {
    const app = new Hono();
    app.use("/a/*", rateLimit({ limit: 1, windowMs: 60_000, scope: "scopeA" }));
    app.use("/b/*", rateLimit({ limit: 1, windowMs: 60_000, scope: "scopeB" }));
    app.get("/a/x", (c) => c.json({ ok: true }));
    app.get("/b/x", (c) => c.json({ ok: true }));

    const ip = { headers: { "x-real-ip": "20.0.0.1" } };
    expect((await app.request("/a/x", ip)).status).toBe(200);
    expect((await app.request("/b/x", ip)).status).toBe(200);
    expect((await app.request("/a/x", ip)).status).toBe(429);
    expect((await app.request("/b/x", ip)).status).toBe(429);
  });

  it("incluye headers X-RateLimit-* informativos", async () => {
    const app = new Hono();
    app.use("*", rateLimit({ limit: 5, windowMs: 60_000, scope: "test4" }));
    app.get("/", (c) => c.json({ ok: true }));

    const res = await app.request("/", { headers: { "x-real-ip": "30.0.0.1" } });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
  });
});
