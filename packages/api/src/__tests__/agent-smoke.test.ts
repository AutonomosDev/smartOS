import { describe, expect, it } from "vitest";
import { runAgent } from "../agent/run.js";

/**
 * Smoke test del agente — gated por env SMARTOS_E2E_LIVE=1.
 * Llama al LLM real y consume API credits ($0.05-0.20).
 * NO corre en CI por default. Solo manual:
 *
 *   SMARTOS_E2E_LIVE=1 pnpm -F @smartos/api test
 *
 * Sirve para validar drift cualitativo después de cambios
 * en system prompt, tools o router.
 */
const isLive = process.env.SMARTOS_E2E_LIVE === "1";

describe.skipIf(!isLive)("Smoke E2E con LLM real", () => {
  it("Q1 estado feedlot → contiene número de animales", async () => {
    const r = await runAgent({
      messages: [{ role: "user", content: "¿Cuántos animales activos hay?" }],
    });
    expect(r.reply).toMatch(/\b8\d{2}\b/); // 800-899 esperado
    expect(r.toolCalls.length).toBeGreaterThan(0);
    expect(r.toolCalls.some((t) => t.name.includes("dashboard"))).toBe(true);
  }, 60_000);

  it("Q4 caso crítico → llama get_animal", async () => {
    const r = await runAgent({
      messages: [
        { role: "user", content: "Dame el detalle del DIIO 26206180." },
      ],
    });
    expect(r.toolCalls.some((t) => t.name === "get_animal")).toBe(true);
    expect(r.reply).toMatch(/26206180/);
    // El animal perdió peso, debe mencionarlo
    expect(r.reply.toLowerCase()).toMatch(/peso|gdp|reclamab/);
  }, 60_000);

  it("Q5 razonamiento → tier standard", async () => {
    const r = await runAgent({
      messages: [
        {
          role: "user",
          content: "¿Por qué Lingues tiene más reclamables que Santa Isabel?",
        },
      ],
    });
    expect(r.tier).toBe("standard");
  }, 60_000);
});
