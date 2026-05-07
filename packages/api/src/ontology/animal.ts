import { sql } from "drizzle-orm";
import { db } from "@smartos/ingestion";
import type { Animal, Pesaje, Tratamiento } from "../schemas/index.js";

/**
 * Entidad Animal — wrap semántico sobre Silver+Gold.
 * NO es una tabla. Compone datos de varias tablas y vistas.
 */

type AnimalRow = {
  diio: string;
  tipo_ganado: string | null;
  estado: string;
  fecha_nacimiento: string | null;
  fecha_ingreso: string | null;
  ultimo_peso_kg: string | null;
  ultimo_peso_at: string | null;
  proveedor: string | null;
  dias_estabulado: number | null;
  peso_ingreso: string | null;
  kg_ganados: string | null;
  gdp_confiable: string | null;
  calidad_gdp: string | null;
};

function toNumber(v: string | number | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildAnimal(row: AnimalRow, enResguardo: boolean, libCarne: string | null, esReclamable: boolean): Animal {
  const pesoActual = toNumber(row.ultimo_peso_kg);
  const prioridad =
    row.estado !== "Vivo" || pesoActual == null
      ? "no_aplica"
      : pesoActual >= 530
      ? "venta_inmediata"
      : pesoActual >= 500
      ? "venta_proxima_30d"
      : pesoActual >= 450
      ? "venta_proxima_60d"
      : "no_aplica";

  return {
    diio: row.diio,
    tipoGanado: row.tipo_ganado,
    estado: row.estado,
    fechaNacimiento: row.fecha_nacimiento,
    fechaIngreso: row.fecha_ingreso,
    pesoActualKg: pesoActual,
    ultimoPesoAt: row.ultimo_peso_at,
    proveedor: row.proveedor,
    diasEstabulado: row.dias_estabulado,
    pesoIngreso: toNumber(row.peso_ingreso),
    kgGanados: toNumber(row.kg_ganados),
    gdpConfiable: toNumber(row.gdp_confiable),
    calidadGdp: row.calidad_gdp as Animal["calidadGdp"],
    esVendible: row.estado === "Vivo" && pesoActual != null && pesoActual >= 450,
    prioridadVenta: prioridad as Animal["prioridadVenta"],
    enResguardoSanitario: enResguardo,
    liberacionCarneAt: libCarne,
    esReclamable,
  };
}

export async function getAnimal(diio: string): Promise<Animal | null> {
  const r = await db.execute<AnimalRow>(sql`
    SELECT a.diio, a.tipo_ganado, a.estado, a.fecha_nacimiento, a.fecha_ingreso,
           a.ultimo_peso_kg, a.ultimo_peso_at,
           c.proveedor,
           e.dias_estabulado, e.peso_ingreso, e.kg_ganados,
           e.gdp_confiable, e.calidad_gdp
    FROM animales a
    LEFT JOIN v_proveedor_canonico c ON c.diio = a.diio
    LEFT JOIN v_estancia_animal e ON e.diio = a.diio
    WHERE a.diio = ${diio}
    LIMIT 1
  `);
  if (!r.rows[0]) return null;
  const row = r.rows[0];

  // Resguardo activo
  const lc = await db.execute<{ liberacion_carne: string | null }>(sql`
    SELECT MAX(liberacion_carne)::text AS liberacion_carne
    FROM tratamientos
    WHERE diio = ${diio} AND liberacion_carne > CURRENT_DATE
  `);
  const libCarne = lc.rows[0]?.liberacion_carne ?? null;

  // Reclamable
  const rc = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM v_reclamables WHERE diio = ${diio}
  `);
  const esReclamable = (rc.rows[0]?.n ?? 0) > 0;

  return buildAnimal(row, libCarne != null, libCarne, esReclamable);
}

export async function listAnimalesActivos(opts: {
  proveedor?: string;
  prioridadVenta?: Animal["prioridadVenta"];
  limit?: number;
} = {}): Promise<Animal[]> {
  const limit = opts.limit ?? 200;
  // Usamos v_estancia_animal que ya tiene join con proveedor
  const rows = await db.execute<AnimalRow>(sql`
    SELECT a.diio, a.tipo_ganado, a.estado, a.fecha_nacimiento, a.fecha_ingreso,
           a.ultimo_peso_kg, a.ultimo_peso_at,
           e.proveedor,
           e.dias_estabulado, e.peso_ingreso, e.kg_ganados,
           e.gdp_confiable, e.calidad_gdp
    FROM animales a
    LEFT JOIN v_estancia_animal e ON e.diio = a.diio
    WHERE a.estado = 'Vivo'
      ${opts.proveedor ? sql`AND e.proveedor = ${opts.proveedor}` : sql``}
    ORDER BY a.ultimo_peso_kg DESC NULLS LAST
    LIMIT ${limit}
  `);

  // Reclamables del set
  const reclSet = new Set<string>(
    (
      await db.execute<{ diio: string }>(sql`SELECT diio FROM v_reclamables`)
    ).rows.map((r) => r.diio)
  );
  // Resguardos activos
  const lcMap = new Map<string, string>();
  for (const r of (
    await db.execute<{ diio: string; lc: string }>(sql`
      SELECT diio, MAX(liberacion_carne)::text AS lc
      FROM tratamientos WHERE liberacion_carne > CURRENT_DATE
      GROUP BY diio
    `)
  ).rows) {
    lcMap.set(r.diio, r.lc);
  }

  let result = rows.rows.map((row) =>
    buildAnimal(row, lcMap.has(row.diio), lcMap.get(row.diio) ?? null, reclSet.has(row.diio))
  );

  if (opts.prioridadVenta) {
    result = result.filter((a) => a.prioridadVenta === opts.prioridadVenta);
  }
  return result;
}

export async function getPesajesAnimal(diio: string): Promise<Pesaje[]> {
  const r = await db.execute<{
    diio: string;
    fecha_pesaje: string;
    peso_kg: string;
    edad_meses: string | null;
    ala_galpon: string | null;
    corral: string | null;
    observaciones: string | null;
    creado_por: string | null;
  }>(sql`
    SELECT diio, fecha_pesaje::text, peso_kg::text,
           edad_meses::text, ala_galpon, corral, observaciones, creado_por
    FROM pesajes WHERE diio = ${diio}
    ORDER BY fecha_pesaje
  `);
  return r.rows.map((x) => ({
    diio: x.diio,
    fechaPesaje: x.fecha_pesaje,
    pesoKg: Number(x.peso_kg),
    edadMeses: x.edad_meses != null ? Number(x.edad_meses) : null,
    alaGalpon: x.ala_galpon,
    corral: x.corral,
    observaciones: x.observaciones,
    creadoPor: x.creado_por,
  }));
}

export async function getTratamientosAnimal(diio: string): Promise<Tratamiento[]> {
  const r = await db.execute<{
    diio: string;
    fecha_tratamiento: string;
    diagnostico: string | null;
    medicamento_nombre: string | null;
    medicamento_sag: string | null;
    via: string | null;
    dosis_ml: string | null;
    resguardo_carne_dias: number | null;
    liberacion_carne: string | null;
    liberacion_leche: string | null;
  }>(sql`
    SELECT diio, fecha_tratamiento::text, diagnostico,
           medicamento_nombre, medicamento_sag, via, dosis_ml::text,
           resguardo_carne_dias,
           liberacion_carne::text, liberacion_leche::text
    FROM tratamientos WHERE diio = ${diio}
    ORDER BY fecha_tratamiento DESC
  `);
  const today = new Date().toISOString().slice(0, 10);
  return r.rows.map((x) => ({
    diio: x.diio,
    fechaTratamiento: x.fecha_tratamiento,
    diagnostico: x.diagnostico,
    medicamentoNombre: x.medicamento_nombre,
    medicamentoSag: x.medicamento_sag,
    via: x.via,
    dosisMl: x.dosis_ml != null ? Number(x.dosis_ml) : null,
    resguardoCarneDias: x.resguardo_carne_dias,
    liberacionCarne: x.liberacion_carne,
    liberacionLeche: x.liberacion_leche,
    enResguardoActivo: x.liberacion_carne != null && x.liberacion_carne > today,
  }));
}
