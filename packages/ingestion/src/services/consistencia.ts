import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

/**
 * Reporte de consistencia de Silver.
 * Cuenta filas en cada vista de validación.
 * Si todo está limpio → todas en 0.
 */
export type ConsistenciaReport = {
  generatedAt: string;
  checks: {
    name: string;
    description: string;
    severity: "high" | "medium" | "low";
    count: number;
    samples?: unknown[];
  }[];
  hasIssues: boolean;
};

const CHECKS: {
  name: string;
  description: string;
  severity: "high" | "medium" | "low";
  view: string;
  sampleCols?: string;
}[] = [
  {
    name: "zombies_bajas",
    description:
      "Animales con estado=Vivo en inventario que ya tienen registro de baja",
    severity: "high",
    view: "v_zombies_bajas",
    sampleCols: "diio, fecha_baja, motivo, detalle",
  },
  {
    name: "zombies_vendidos",
    description:
      "Animales con estado=Vivo pero con pesaje 'PESAJE DESDE VENTA' previo",
    severity: "high",
    view: "v_zombies_vendidos",
    sampleCols: "diio, fecha_venta_inferida, peso_venta_inferido",
  },
  {
    name: "pesajes_huerfanos",
    description:
      "DIIOs con pesajes pero NO presentes en inventario (animales históricos / vendidos)",
    severity: "low",
    view: "v_pesajes_huerfanos",
    sampleCols: "diio, pesajes_count, primer_pesaje, ultimo_pesaje",
  },
  {
    name: "tratamientos_a_muertos",
    description:
      "Tratamientos aplicados a animales con fecha_baja anterior al tratamiento",
    severity: "high",
    view: "v_tratamientos_a_muertos",
    sampleCols:
      "diio, fecha_tratamiento, medicamento_nombre, fecha_baja, motivo, dias_post_baja",
  },
  {
    name: "inventario_stale",
    description:
      "Animales activos sin pesaje en últimos 60 días (data desactualizada o EID/balanza fallando)",
    severity: "medium",
    view: "v_inventario_stale",
    sampleCols: "diio, tipo_ganado, ultimo_peso_kg, ultimo_peso_at, dias_sin_pesaje",
  },
];

export async function buildConsistenciaReport(): Promise<ConsistenciaReport> {
  const checks: ConsistenciaReport["checks"] = [];

  for (const c of CHECKS) {
    const countResult = await db.execute<{ n: number }>(
      sql.raw(`SELECT COUNT(*)::int AS n FROM ${c.view}`)
    );
    const count = countResult.rows[0]?.n ?? 0;

    let samples: unknown[] | undefined;
    if (count > 0 && c.sampleCols) {
      const sampleResult = await db.execute(
        sql.raw(`SELECT ${c.sampleCols} FROM ${c.view} LIMIT 5`)
      );
      samples = sampleResult.rows;
    }

    checks.push({
      name: c.name,
      description: c.description,
      severity: c.severity,
      count,
      ...(samples ? { samples } : {}),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    checks,
    hasIssues: checks.some((c) => c.count > 0 && c.severity !== "low"),
  };
}
