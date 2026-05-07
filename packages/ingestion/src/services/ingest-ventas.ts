import { eq, inArray, sql } from "drizzle-orm";
import { TENANCY } from "../config/tenancy.js";
import { db } from "../db/client.js";
import {
  landings,
  ventas,
  ventasAnimales,
  ventasAnimalesBronze,
  ventasBronze,
} from "../db/schema/index.js";
import {
  parseVentasCabeceraXlsx,
  parseVentasDetalleXlsx,
} from "../parsers/ventas-xlsx.js";
import { uploadRaw } from "../storage/gcs.js";

function operacionSlug(): string {
  return TENANCY.operacion.nombre.toLowerCase().replace(/\s+/g, "-");
}

export type IngestVentasCabeceraResult = {
  ingestId: string;
  landingId: string;
  gcsUri: string;
  sourceFile: string;
  totalRows: number;
  bronzeInserted: number;
  silverUpserted: number;
  errors: { rowNumber: number; reason: string }[];
};

export async function ingestVentasCabecera(
  buffer: Buffer,
  sourceFile: string
): Promise<IngestVentasCabeceraResult> {
  const operacion = operacionSlug();
  const meta = await uploadRaw({
    kind: "ventas",
    operacion,
    fileName: sourceFile,
    buffer,
  });
  const parsed = await parseVentasCabeceraXlsx(buffer);

  return await db.transaction(async (tx) => {
    const [landing] = await tx
      .insert(landings)
      .values({
        kind: "ventas",
        operacion,
        sourceFile,
        gcsUri: meta.gcsUri,
        fileSizeBytes: meta.fileSizeBytes,
        fileMd5: meta.fileMd5,
        contentType: meta.contentType,
      })
      .returning({ id: landings.id, ingestId: landings.ingestId });

    if (!landing) throw new Error("landing_insert_failed");

    if (parsed.validRows.length === 0) {
      return {
        ingestId: landing.ingestId,
        landingId: landing.id,
        gcsUri: meta.gcsUri,
        sourceFile,
        totalRows: parsed.totalRows,
        bronzeInserted: 0,
        silverUpserted: 0,
        errors: parsed.errors,
      };
    }

    const bronzeValues = parsed.validRows.map((r) => ({
      ingestId: landing.ingestId,
      sourceFile,
      rowNumber: r.rowNumber,
      raw: r.raw,
    }));

    const CHUNK = 500;
    let bronzeInserted = 0;
    for (let i = 0; i < bronzeValues.length; i += CHUNK) {
      const slice = bronzeValues.slice(i, i + CHUNK);
      const inserted = await tx
        .insert(ventasBronze)
        .values(slice)
        .returning({ id: ventasBronze.id });
      bronzeInserted += inserted.length;
    }

    const silverValues = parsed.validRows.map((r) => ({
      numeroVenta: r.silver.numeroVenta,
      fechaVenta: r.silver.fechaVenta,
      cantidadAnimales: r.silver.cantidadAnimales,
      cantidadPesados: r.silver.cantidadPesados,
      pesoTotalKg: r.silver.pesoTotalKg,
      tipoGanadoResumen: r.silver.tipoGanadoResumen,
      estado: r.silver.estado,
      observaciones: r.silver.observaciones,
      creadoPor: r.silver.creadoPor,
      fechaCreadoSistema: r.silver.fechaCreadoSistema
        ? new Date(r.silver.fechaCreadoSistema)
        : null,
      sourceFile,
    }));

    let silverUpserted = 0;
    for (let i = 0; i < silverValues.length; i += CHUNK) {
      const slice = silverValues.slice(i, i + CHUNK);
      const upserted = await tx
        .insert(ventas)
        .values(slice)
        .onConflictDoUpdate({
          target: ventas.numeroVenta,
          set: {
            fechaVenta: sql`excluded.fecha_venta`,
            cantidadAnimales: sql`excluded.cantidad_animales`,
            cantidadPesados: sql`excluded.cantidad_pesados`,
            pesoTotalKg: sql`excluded.peso_total_kg`,
            tipoGanadoResumen: sql`excluded.tipo_ganado_resumen`,
            estado: sql`excluded.estado`,
            observaciones: sql`excluded.observaciones`,
            creadoPor: sql`excluded.creado_por`,
            fechaCreadoSistema: sql`excluded.fecha_creado_sistema`,
            ingestedAt: sql`now()`,
            sourceFile: sql`excluded.source_file`,
          },
        })
        .returning({ id: ventas.id });
      silverUpserted += upserted.length;
    }

    return {
      ingestId: landing.ingestId,
      landingId: landing.id,
      gcsUri: meta.gcsUri,
      sourceFile,
      totalRows: parsed.totalRows,
      bronzeInserted,
      silverUpserted,
      errors: parsed.errors,
    };
  });
}

export type Discrepancia = {
  numeroVenta: number;
  campo: "cantidad_animales" | "peso_total_kg";
  cabecera: string | number;
  detalle: string | number;
};

export type IngestVentasDetalleResult = {
  ingestId: string;
  landingId: string;
  gcsUri: string;
  sourceFile: string;
  totalRows: number;
  bronzeInserted: number;
  silverInserted: number;
  silverAlreadyExisted: number;
  errors: { rowNumber: number; reason: string }[];
  discrepancias: Discrepancia[];
  ventasFaltantes: number[];
};

export async function ingestVentasDetalle(
  buffer: Buffer,
  sourceFile: string
): Promise<IngestVentasDetalleResult> {
  const operacion = operacionSlug();
  const meta = await uploadRaw({
    kind: "ventas-detalle",
    operacion,
    fileName: sourceFile,
    buffer,
  });
  const parsed = await parseVentasDetalleXlsx(buffer);

  // Pre-check: ¿existen TODAS las ventas referenciadas?
  const numerosVenta = [...new Set(parsed.validRows.map((r) => r.silver.numeroVenta))];
  const ventasExistentes =
    numerosVenta.length === 0
      ? []
      : await db
          .select({
            id: ventas.id,
            numeroVenta: ventas.numeroVenta,
            cantidadAnimales: ventas.cantidadAnimales,
            pesoTotalKg: ventas.pesoTotalKg,
          })
          .from(ventas)
          .where(inArray(ventas.numeroVenta, numerosVenta));

  const ventaByNumero = new Map(ventasExistentes.map((v) => [v.numeroVenta, v]));
  const ventasFaltantes = numerosVenta.filter((n) => !ventaByNumero.has(n));

  if (ventasFaltantes.length > 0) {
    throw new Error(
      `ventas_padre_faltantes: numeros [${ventasFaltantes.join(", ")}] — subir Ventas_Historial primero`
    );
  }

  return await db.transaction(async (tx) => {
    const [landing] = await tx
      .insert(landings)
      .values({
        kind: "ventas-detalle",
        operacion,
        sourceFile,
        gcsUri: meta.gcsUri,
        fileSizeBytes: meta.fileSizeBytes,
        fileMd5: meta.fileMd5,
        contentType: meta.contentType,
      })
      .returning({ id: landings.id, ingestId: landings.ingestId });

    if (!landing) throw new Error("landing_insert_failed");

    if (parsed.validRows.length === 0) {
      return {
        ingestId: landing.ingestId,
        landingId: landing.id,
        gcsUri: meta.gcsUri,
        sourceFile,
        totalRows: parsed.totalRows,
        bronzeInserted: 0,
        silverInserted: 0,
        silverAlreadyExisted: 0,
        errors: parsed.errors,
        discrepancias: [],
        ventasFaltantes: [],
      };
    }

    const bronzeValues = parsed.validRows.map((r) => ({
      ingestId: landing.ingestId,
      sourceFile,
      rowNumber: r.rowNumber,
      raw: r.raw,
    }));

    const CHUNK = 500;
    let bronzeInserted = 0;
    for (let i = 0; i < bronzeValues.length; i += CHUNK) {
      const slice = bronzeValues.slice(i, i + CHUNK);
      const inserted = await tx
        .insert(ventasAnimalesBronze)
        .values(slice)
        .returning({ id: ventasAnimalesBronze.id });
      bronzeInserted += inserted.length;
    }

    const silverValues = parsed.validRows.map((r) => {
      const venta = ventaByNumero.get(r.silver.numeroVenta);
      if (!venta) {
        // ya validado arriba pero TS no lo sabe
        throw new Error(`venta_padre_missing: ${r.silver.numeroVenta}`);
      }
      return {
        ventaId: venta.id,
        numeroVenta: r.silver.numeroVenta,
        diio: r.silver.diio,
        tipoGanado: r.silver.tipoGanado,
        estadoReproductivo: r.silver.estadoReproductivo,
        estadoLeche: r.silver.estadoLeche,
        pesoKg: r.silver.pesoKg,
        mangada: r.silver.mangada,
        sourceFile,
      };
    });

    let silverInserted = 0;
    for (let i = 0; i < silverValues.length; i += CHUNK) {
      const slice = silverValues.slice(i, i + CHUNK);
      const inserted = await tx
        .insert(ventasAnimales)
        .values(slice)
        .onConflictDoNothing({
          target: [ventasAnimales.ventaId, ventasAnimales.diio],
        })
        .returning({ id: ventasAnimales.id });
      silverInserted += inserted.length;
    }

    const silverAlreadyExisted = parsed.validRows.length - silverInserted;

    // Verificación cruzada: SUM(detalle.peso) vs cabecera.peso_total
    const discrepancias: Discrepancia[] = [];
    for (const numero of numerosVenta) {
      const cab = ventaByNumero.get(numero);
      if (!cab) continue;
      const filasDeEsta = parsed.validRows.filter(
        (r) => r.silver.numeroVenta === numero
      );
      const conteoDetalle = filasDeEsta.length;
      const sumPesoDetalle = filasDeEsta.reduce(
        (acc, r) => acc + Number(r.silver.pesoKg ?? 0),
        0
      );

      if (
        cab.cantidadAnimales != null &&
        cab.cantidadAnimales !== conteoDetalle
      ) {
        discrepancias.push({
          numeroVenta: numero,
          campo: "cantidad_animales",
          cabecera: cab.cantidadAnimales,
          detalle: conteoDetalle,
        });
      }

      const cabPeso = cab.pesoTotalKg != null ? Number(cab.pesoTotalKg) : null;
      if (
        cabPeso != null &&
        Math.abs(cabPeso - sumPesoDetalle) > 0.5 // tolerancia 0.5 kg
      ) {
        discrepancias.push({
          numeroVenta: numero,
          campo: "peso_total_kg",
          cabecera: cabPeso.toFixed(2),
          detalle: sumPesoDetalle.toFixed(2),
        });
      }
    }

    return {
      ingestId: landing.ingestId,
      landingId: landing.id,
      gcsUri: meta.gcsUri,
      sourceFile,
      totalRows: parsed.totalRows,
      bronzeInserted,
      silverInserted,
      silverAlreadyExisted,
      errors: parsed.errors,
      discrepancias,
      ventasFaltantes: [],
    };
  });
}
