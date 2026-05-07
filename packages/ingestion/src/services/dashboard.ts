import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

/**
 * Servicio Gold — consume las vistas de Capa 3.
 * Devuelve estructuras tipadas para que la API
 * exponga al cliente sin tocar SQL crudo.
 */

export type DashboardCabecera = {
  fechaReporte: string;
  inventario: {
    animalesActivos: number;
    kgTotalesActivos: number;
    pesoAvgActivos: number;
  };
  gdp: {
    avgConfiable: number | null;
    animalesEvaluables: number;
  };
  zonaVenta: {
    animales: number;
    valorEstimadoUsd: number;
  };
  alarmas: {
    resguardoCarne: number;
    reclamables: number;
    sinPesar60d: number;
    edadImposible: number;
  };
  historico: {
    ventasTotal: number;
    bajasTotal: number;
    tratamientosTotal: number;
    pctCojera: number;
  };
};

export async function getDashboardCabecera(): Promise<DashboardCabecera> {
  const r = await db.execute<{
    fecha_reporte: string;
    animales_activos: number;
    kg_totales_activos: number;
    peso_avg_activos: number;
    gdp_avg_confiable: number | null;
    gdp_animales_evaluables: number;
    animales_zona_venta: number;
    valor_zona_venta_usd: number;
    alarmas_resguardo_carne: number;
    animales_reclamables: number;
    animales_sin_pesar_60d: number;
    animales_edad_imposible: number;
    ventas_historicas_total: number;
    bajas_historicas_total: number;
    tratamientos_historicos_total: number;
    pct_tratamientos_cojera: number;
  }>(sql`SELECT * FROM v_dashboard_mollendo`);
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

export type RankingProveedor = {
  proveedor: string;
  animalesActivos: number;
  animalesEvaluables: number;
  pesoActualAvg: number;
  diasAvg: number;
  gdpAvg: number | null;
  gdpMin: number | null;
  gdpMediana: number | null;
  reclamables: number;
  pctReclamable: number | null;
};

export async function getRankingProveedor(): Promise<RankingProveedor[]> {
  const r = await db.execute<{
    proveedor: string;
    animales_activos: number;
    animales_evaluables: number;
    peso_actual_avg: number;
    dias_avg: number;
    gdp_avg: number | null;
    gdp_min: number | null;
    gdp_mediana: number | null;
    reclamables: number;
    pct_reclamable: number | null;
  }>(
    sql`SELECT * FROM v_ranking_proveedor ORDER BY gdp_avg DESC NULLS LAST`
  );
  return r.rows.map((x) => ({
    proveedor: String(x.proveedor),
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

export type AnimalZonaVenta = {
  proveedor: string | null;
  diio: string;
  tipoGanado: string | null;
  pesoActual: number;
  diasEstabulado: number;
  gdpConfiable: number | null;
  valorEstimadoUsd: number;
  prioridad: "venta_inmediata" | "venta_proxima_30d" | "venta_proxima_60d";
};

export async function getZonaVenta(
  prioridad?: AnimalZonaVenta["prioridad"]
): Promise<AnimalZonaVenta[]> {
  const r = prioridad
    ? await db.execute<Record<string, unknown>>(
        sql`SELECT * FROM v_zona_dinero WHERE prioridad = ${prioridad} ORDER BY peso_actual DESC`
      )
    : await db.execute<Record<string, unknown>>(
        sql`SELECT * FROM v_zona_dinero ORDER BY peso_actual DESC`
      );
  return r.rows.map((x) => ({
    proveedor: x.proveedor != null ? String(x.proveedor) : null,
    diio: String(x.diio),
    tipoGanado: x.tipo_ganado != null ? String(x.tipo_ganado) : null,
    pesoActual: Number(x.peso_actual),
    diasEstabulado: Number(x.dias_estabulado),
    gdpConfiable: x.gdp_confiable != null ? Number(x.gdp_confiable) : null,
    valorEstimadoUsd: Number(x.valor_estimado_usd),
    prioridad: x.prioridad as AnimalZonaVenta["prioridad"],
  }));
}

export type AlarmaResguardo = {
  diio: string;
  fechaTratamiento: string;
  medicamentoNombre: string | null;
  medicamentoSag: string | null;
  diagnostico: string | null;
  resguardoCarneDias: number | null;
  liberacionCarne: string;
  diasFaltantes: number;
};

export async function getAlarmasResguardoCarne(): Promise<AlarmaResguardo[]> {
  const r = await db.execute<Record<string, unknown>>(
    sql`SELECT * FROM v_alarmas_resguardo_carne LIMIT 100`
  );
  return r.rows.map((x) => ({
    diio: String(x.diio),
    fechaTratamiento: String(x.fecha_tratamiento),
    medicamentoNombre: x.medicamento_nombre != null ? String(x.medicamento_nombre) : null,
    medicamentoSag: x.medicamento_sag != null ? String(x.medicamento_sag) : null,
    diagnostico: x.diagnostico != null ? String(x.diagnostico) : null,
    resguardoCarneDias: x.resguardo_carne_dias != null ? Number(x.resguardo_carne_dias) : null,
    liberacionCarne: String(x.liberacion_carne),
    diasFaltantes: Number(x.dias_faltantes),
  }));
}

export type KpiMensual = {
  mes: string;
  ventas: number;
  animalesVendidos: number;
  kgVendidos: number;
  cojera: number;
  tratamientos: number;
  bajas: number;
};

export async function getKpisMensuales(): Promise<KpiMensual[]> {
  const r = await db.execute<{
    mes: string;
    ventas: number;
    animales_vendidos: number;
    kg_vendidos: number;
    cojera: number;
    tratamientos: number;
    bajas: number;
  }>(sql`SELECT * FROM v_kpis_mensuales`);
  return r.rows.map((x) => ({
    mes: String(x.mes),
    ventas: Number(x.ventas),
    animalesVendidos: Number(x.animales_vendidos),
    kgVendidos: Number(x.kg_vendidos),
    cojera: Number(x.cojera),
    tratamientos: Number(x.tratamientos),
    bajas: Number(x.bajas),
  }));
}
