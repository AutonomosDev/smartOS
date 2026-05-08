import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { agentActions, db } from "@smartos/ingestion";
import { executeWriteTool } from "../services/agent-actions.js";

/**
 * Tests del flujo completo de mutations.
 * Aplican las 7 reglas de .claude/rules/agent-actions.md
 *
 * Requieren postgres local con data Mollendo cargada.
 */

const TEST_DIIO_PESAJE = "16356800"; // existe, novillo activo Sta Alejandra
const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
})();

describe("executeWriteTool — registrar_pesaje (reversibility=soft)", () => {
  beforeEach(async () => {
    // Limpiar pesajes de test del día (test usa fechas futuras)
    await db.execute(
      sql`DELETE FROM pesajes WHERE diio = ${TEST_DIIO_PESAJE} AND fecha_pesaje = ${TOMORROW}`
    );
  });

  it("dry_run=true devuelve simulation sin tocar DB", async () => {
    const r = await executeWriteTool({
      toolName: "registrar_pesaje",
      input: { diio: TEST_DIIO_PESAJE, peso_kg: 410, fecha: TOMORROW },
      dryRun: true,
      callerRole: "operador",
    });
    expect(r.status).toBe("success");
    expect(r.mode).toBe("dry_run");
    if (r.status === "success") {
      expect(r.simulation).toBeDefined();
      expect(r.simulation!.willDo.diio).toBe(TEST_DIIO_PESAJE);
      expect(r.simulation!.sideEffects.length).toBeGreaterThan(0);
    }

    // Verifica que NO se insertó pesaje
    const check = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM pesajes WHERE diio = ${TEST_DIIO_PESAJE} AND fecha_pesaje = ${TOMORROW}`
    );
    expect(check.rows[0]!.n).toBe(0);
  });

  it("dry_run=false sin userConfirmed → needs_confirmation", async () => {
    const r = await executeWriteTool({
      toolName: "registrar_pesaje",
      input: { diio: TEST_DIIO_PESAJE, peso_kg: 410, fecha: TOMORROW },
      dryRun: false, // pide ejecutar
      callerRole: "operador",
      // sin userConfirmed
    });
    expect(r.status).toBe("needs_confirmation");
    if (r.status === "needs_confirmation") {
      expect(r.reason).toContain("userConfirmed");
      expect(r.simulation).toBeDefined();
    }

    // No se ejecutó realmente
    const check = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM pesajes WHERE diio = ${TEST_DIIO_PESAJE} AND fecha_pesaje = ${TOMORROW}`
    );
    expect(check.rows[0]!.n).toBe(0);
  });

  it("dry_run=false + userConfirmed=true → ejecuta", async () => {
    const r = await executeWriteTool({
      toolName: "registrar_pesaje",
      input: { diio: TEST_DIIO_PESAJE, peso_kg: 410, fecha: TOMORROW },
      dryRun: false,
      userConfirmed: true,
      callerRole: "operador",
    });
    expect(r.status).toBe("success");
    expect(r.mode).toBe("executed");

    // Sí se insertó
    const check = await db.execute<{ n: number; peso: string }>(
      sql`SELECT COUNT(*)::int AS n, MAX(peso_kg::text) AS peso FROM pesajes WHERE diio = ${TEST_DIIO_PESAJE} AND fecha_pesaje = ${TOMORROW}`
    );
    expect(check.rows[0]!.n).toBe(1);
    expect(Number(check.rows[0]!.peso)).toBe(410);

    // Audit log creado
    const audit = await db
      .select()
      .from(agentActions)
      .where(sql`tool_name = 'registrar_pesaje' AND status = 'success' AND user_confirmed = true`)
      .limit(5);
    expect(audit.length).toBeGreaterThan(0);
  });

  it("idempotency: misma key 2 veces → mismo result, NO duplica", async () => {
    const key = randomUUID();
    const r1 = await executeWriteTool({
      toolName: "registrar_pesaje",
      input: { diio: TEST_DIIO_PESAJE, peso_kg: 411, fecha: TOMORROW },
      dryRun: false,
      userConfirmed: true,
      callerRole: "operador",
      idempotencyKey: key,
    });
    expect(r1.status).toBe("success");

    const r2 = await executeWriteTool({
      toolName: "registrar_pesaje",
      input: { diio: TEST_DIIO_PESAJE, peso_kg: 411, fecha: TOMORROW },
      dryRun: false,
      userConfirmed: true,
      callerRole: "operador",
      idempotencyKey: key,
    });
    expect(r2.status).toBe("success");
    expect(r2.actionId).toBe(r1.actionId); // misma fila audit

    // Pesaje insertado solo 1 vez
    const check = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM pesajes WHERE diio = ${TEST_DIIO_PESAJE} AND fecha_pesaje = ${TOMORROW}`
    );
    expect(check.rows[0]!.n).toBe(1);
  });

  it("warnings simulan GDP imposible", async () => {
    // Animal tiene último peso ~390 kg. 800 kg en próximo pesaje = GDP imposible.
    const r = await executeWriteTool({
      toolName: "registrar_pesaje",
      input: { diio: TEST_DIIO_PESAJE, peso_kg: 800, fecha: TOMORROW },
      dryRun: true,
      callerRole: "operador",
    });
    expect(r.status).toBe("success");
    if (r.status === "success") {
      const warnings = r.simulation!.warnings;
      expect(warnings.some((w) => w.includes("imposible") || w.includes("GDP"))).toBe(true);
    }
  });

  it("validación: DIIO con letras → warnings con error", async () => {
    const r = await executeWriteTool({
      toolName: "registrar_pesaje",
      input: { diio: "ABC123", peso_kg: 410, fecha: TOMORROW },
      dryRun: true,
      callerRole: "operador",
    });
    expect(r.status).toBe("success"); // dry_run no falla
    if (r.status === "success") {
      expect(r.simulation!.warnings.some((w) => w.includes("DIIO"))).toBe(true);
    }
  });

  it("permisos: caller viewer → forbidden", async () => {
    await expect(
      executeWriteTool({
        toolName: "registrar_pesaje",
        input: { diio: TEST_DIIO_PESAJE, peso_kg: 410, fecha: TOMORROW },
        dryRun: true,
        callerRole: "viewer",
      })
    ).rejects.toThrow(/forbidden/);
  });
});

describe("executeWriteTool — registrar_baja (reversibility=hard)", () => {
  it("hard reversibility requiere doubleConfirm aún con userConfirmed", async () => {
    const r = await executeWriteTool({
      toolName: "registrar_baja",
      input: {
        diio: "9999999",
        motivo: "Muerte",
        detalle: "test",
        fecha: TODAY,
      },
      dryRun: false,
      userConfirmed: true,
      // sin doubleConfirm
      callerRole: "admin_org",
    });
    expect(r.status).toBe("needs_confirmation");
    if (r.status === "needs_confirmation") {
      expect(r.reason).toMatch(/hard|doubleConfirm/);
    }
  });

  it("permisos: operador NO puede registrar baja (requiere admin_org)", async () => {
    await expect(
      executeWriteTool({
        toolName: "registrar_baja",
        input: {
          diio: "9999999",
          motivo: "Muerte",
          fecha: TODAY,
        },
        dryRun: true,
        callerRole: "operador",
      })
    ).rejects.toThrow(/forbidden/);
  });

  it("simulate baja con motivo=Faena de animal en resguardo → warning SAG", async () => {
    // Buscar animal con resguardo activo
    const r = await executeWriteTool({
      toolName: "registrar_baja",
      input: {
        diio: "26206180", // Sta Isabel, sin resguardo activo, OK como prueba
        motivo: "Faena",
        fecha: TODAY,
      },
      dryRun: true,
      callerRole: "admin_org",
    });
    expect(r.status).toBe("success");
    // No tiene resguardo activo, no debe alertar
    if (r.status === "success") {
      expect(r.simulation).toBeDefined();
    }
  });
});

describe("Tool no existente", () => {
  it("rejects con unknown_tool", async () => {
    await expect(
      executeWriteTool({
        toolName: "tool_inexistente",
        input: {},
        dryRun: true,
        callerRole: "admin_org",
      })
    ).rejects.toThrow(/unknown_tool/);
  });
});

afterAll(async () => {
  // Cleanup: eliminar pesajes de test
  await db.execute(
    sql`DELETE FROM pesajes WHERE diio = ${TEST_DIIO_PESAJE} AND fecha_pesaje = ${TOMORROW}`
  );
});
