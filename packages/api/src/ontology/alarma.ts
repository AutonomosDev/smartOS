import { sql } from "drizzle-orm";
import { db } from "@smartos/ingestion";
import type { AlarmaResguardo, DashboardCabecera } from "../schemas/index.js";

export async function listAlarmasResguardoCarne(): Promise<AlarmaResguardo[]> {
  const r = await db.execute<{
    diio: string;
    fecha_tratamiento: string;
    medicamento_nombre: string | null;
    diagnostico: string | null;
    liberacion_carne: string;
    dias_faltantes: number;
  }>(sql`
    SELECT diio, fecha_tratamiento::text, medicamento_nombre,
           diagnostico, liberacion_carne::text, dias_faltantes
    FROM v_alarmas_resguardo_carne
  `);
  return r.rows.map((x) => ({
    diio: x.diio,
    fechaTratamiento: x.fecha_tratamiento,
    medicamentoNombre: x.medicamento_nombre,
    diagnostico: x.diagnostico,
    liberacionCarne: x.liberacion_carne,
    diasFaltantes: Number(x.dias_faltantes),
  }));
}

export async function getDashboardCabecera(): Promise<DashboardCabecera> {
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT * FROM v_dashboard_mollendo
  `);
  const x = r.rows[0]!;
  return {
    fechaReporte: String(x.fecha_reporte),
    inventario: {
      animalesActivos: Number(x.animales_activos),
      kgTotalesActivos: Number(x.kg_totales_activos),
      pesoAvgActivos: Number(x.peso_avg_activos),
    },
    gdp: {
      avgConfiable: x.gdp_avg_confiable != null ? Number(x.gdp_avg_confiable) : null,
      animalesEvaluables: Number(x.gdp_animales_evaluables),
    },
    zonaVenta: {
      animales: Number(x.animales_zona_venta),
      valorEstimadoUsd: Number(x.valor_zona_venta_usd),
    },
    alarmas: {
      resguardoCarne: Number(x.alarmas_resguardo_carne),
      reclamables: Number(x.animales_reclamables),
      sinPesar60d: Number(x.animales_sin_pesar_60d),
      edadImposible: Number(x.animales_edad_imposible),
    },
    historico: {
      ventasTotal: Number(x.ventas_historicas_total),
      bajasTotal: Number(x.bajas_historicas_total),
      tratamientosTotal: Number(x.tratamientos_historicos_total),
      pctCojera: Number(x.pct_tratamientos_cojera),
    },
  };
}
