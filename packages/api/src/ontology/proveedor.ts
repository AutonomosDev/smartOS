import { sql } from "drizzle-orm";
import { db } from "@smartos/ingestion";
import type { Proveedor } from "../schemas/index.js";

export async function getProveedor(nombre: string): Promise<Proveedor | null> {
  const r = await db.execute<{
    proveedor: string;
    animales_activos: number;
    animales_evaluables: number;
    peso_actual_avg: string;
    dias_avg: number;
    gdp_avg: string | null;
    gdp_min: string | null;
    gdp_mediana: string | null;
    reclamables: number;
    pct_reclamable: string | null;
  }>(sql`
    SELECT * FROM v_ranking_proveedor WHERE proveedor = ${nombre} LIMIT 1
  `);
  if (!r.rows[0]) return null;
  const x = r.rows[0];
  return {
    nombre: x.proveedor,
    animalesActivos: Number(x.animales_activos),
    animalesEvaluables: Number(x.animales_evaluables),
    pesoActualAvg: Number(x.peso_actual_avg),
    diasAvg: Number(x.dias_avg),
    gdpAvg: x.gdp_avg != null ? Number(x.gdp_avg) : null,
    gdpMin: x.gdp_min != null ? Number(x.gdp_min) : null,
    gdpMediana: x.gdp_mediana != null ? Number(x.gdp_mediana) : null,
    reclamables: Number(x.reclamables),
    pctReclamable: x.pct_reclamable != null ? Number(x.pct_reclamable) : null,
  };
}

export async function listProveedores(): Promise<Proveedor[]> {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT * FROM v_ranking_proveedor ORDER BY gdp_avg DESC NULLS LAST
  `);
  return r.rows.map((x) => ({
    nombre: String(x.proveedor),
    animalesActivos: Number(x.animales_activos),
    animalesEvaluables: Number(x.animales_evaluables),
    pesoActualAvg: Number(x.peso_actual_avg),
    diasAvg: Number(x.dias_avg),
    gdpAvg: x.gdp_avg != null ? Number(x.gdp_avg) : null,
    gdpMin: x.gdp_min != null ? Number(x.gdp_min) : null,
    gdpMediana: x.gdp_mediana != null ? Number(x.gdp_mediana) : null,
    reclamables: Number(x.reclamables),
    pctReclamable: x.pct_reclamable != null ? Number(x.pct_reclamable) : null,
  }));
}
