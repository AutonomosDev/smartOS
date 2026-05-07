import { sql } from "drizzle-orm";
import { db } from "@smartos/ingestion";
import type { Venta } from "../schemas/index.js";

export async function getVenta(numeroVenta: number): Promise<Venta | null> {
  const r = await db.execute<{
    numero_venta: number;
    fecha_venta: string;
    cantidad_animales: number | null;
    peso_total_kg: string | null;
    estado: string | null;
    creado_por: string | null;
  }>(sql`
    SELECT numero_venta, fecha_venta::text, cantidad_animales,
           peso_total_kg::text, estado, creado_por
    FROM ventas WHERE numero_venta = ${numeroVenta} LIMIT 1
  `);
  if (!r.rows[0]) return null;
  const x = r.rows[0];
  const peso = x.peso_total_kg != null ? Number(x.peso_total_kg) : null;
  return {
    numeroVenta: Number(x.numero_venta),
    fechaVenta: x.fecha_venta,
    cantidadAnimales: x.cantidad_animales,
    pesoTotalKg: peso,
    pesoPromedioKg:
      peso != null && x.cantidad_animales ? peso / x.cantidad_animales : null,
    estado: x.estado,
    creadoPor: x.creado_por,
  };
}

export async function listVentas(opts: { desde?: string; hasta?: string; limit?: number } = {}): Promise<Venta[]> {
  const limit = opts.limit ?? 100;
  const r = await db.execute<Record<string, unknown>>(sql`
    SELECT numero_venta, fecha_venta::text, cantidad_animales,
           peso_total_kg::text, estado, creado_por
    FROM ventas
    WHERE 1=1
      ${opts.desde ? sql`AND fecha_venta >= ${opts.desde}` : sql``}
      ${opts.hasta ? sql`AND fecha_venta <= ${opts.hasta}` : sql``}
    ORDER BY fecha_venta DESC
    LIMIT ${limit}
  `);
  return r.rows.map((x) => {
    const peso = x.peso_total_kg != null ? Number(x.peso_total_kg) : null;
    const cant = x.cantidad_animales != null ? Number(x.cantidad_animales) : null;
    return {
      numeroVenta: Number(x.numero_venta),
      fechaVenta: String(x.fecha_venta),
      cantidadAnimales: cant,
      pesoTotalKg: peso,
      pesoPromedioKg: peso != null && cant ? peso / cant : null,
      estado: x.estado != null ? String(x.estado) : null,
      creadoPor: x.creado_por != null ? String(x.creado_por) : null,
    };
  });
}
