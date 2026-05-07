import { sql } from "drizzle-orm";
import { TENANCY } from "../config/tenancy.js";
import { db } from "../db/client.js";
import {
  animales,
  inventarioBronze,
  landings,
} from "../db/schema/index.js";
import { parseInventarioXlsx } from "../parsers/inventario-xlsx.js";
import { uploadRaw } from "../storage/gcs.js";

const KIND = "inventario";

function operacionSlug(): string {
  return TENANCY.operacion.nombre.toLowerCase().replace(/\s+/g, "-");
}

export type IngestResult = {
  ingestId: string;
  landingId: string;
  gcsUri: string;
  sourceFile: string;
  totalRows: number;
  bronzeInserted: number;
  silverUpserted: number;
  errors: { rowNumber: number; reason: string }[];
};

export async function ingestInventario(
  buffer: Buffer,
  sourceFile: string
): Promise<IngestResult> {
  // 0) Landing: subir el archivo CRUDO a GCS antes de tocar nada más.
  //    Si esto falla, no perdimos data y el cliente recibe error explícito.
  const operacion = operacionSlug();
  const meta = await uploadRaw({
    kind: KIND,
    operacion,
    fileName: sourceFile,
    buffer,
  });

  const parsed = await parseInventarioXlsx(buffer);

  return await db.transaction(async (tx) => {
    // 1) Insertar landing — define el ingest_id que va a usar Bronze
    const [landing] = await tx
      .insert(landings)
      .values({
        kind: KIND,
        operacion,
        sourceFile,
        gcsUri: meta.gcsUri,
        fileSizeBytes: meta.fileSizeBytes,
        fileMd5: meta.fileMd5,
        contentType: meta.contentType,
      })
      .returning({ id: landings.id, ingestId: landings.ingestId });

    if (!landing) {
      throw new Error("landing_insert_failed");
    }

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

    // 2) Bronze: append todas las filas con el ingest_id del landing
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
        .insert(inventarioBronze)
        .values(slice)
        .returning({ id: inventarioBronze.id });
      bronzeInserted += inserted.length;
    }

    // 3) Silver: upsert por DIIO con los 17 campos
    const silverValues = parsed.validRows.map((r) => ({
      diio: r.silver.diio,
      estado: r.silver.estado,
      tipoGanado: r.silver.tipoGanado,
      fechaNacimiento: r.silver.fechaNacimiento,
      estadoReproductivo: r.silver.estadoReproductivo,
      estadoLeche: r.silver.estadoLeche,
      ultimoParto: r.silver.ultimoParto,
      ultimaInseminacion: r.silver.ultimaInseminacion,
      totalIa: r.silver.totalIa,
      diasEnLeche: r.silver.diasEnLeche,
      diioMadre: r.silver.diioMadre,
      padre: r.silver.padre,
      origen: r.silver.origen,
      fechaIngreso: r.silver.fechaIngreso,
      ultimoPesoKg: r.silver.ultimoPesoKg,
      ultimoPesoAt: r.silver.ultimoPesoAt,
      observaciones: r.silver.observaciones,
      sourceFile,
    }));

    let silverUpserted = 0;
    for (let i = 0; i < silverValues.length; i += CHUNK) {
      const slice = silverValues.slice(i, i + CHUNK);
      const upserted = await tx
        .insert(animales)
        .values(slice)
        .onConflictDoUpdate({
          target: animales.diio,
          set: {
            estado: sql`excluded.estado`,
            tipoGanado: sql`excluded.tipo_ganado`,
            fechaNacimiento: sql`excluded.fecha_nacimiento`,
            estadoReproductivo: sql`excluded.estado_reproductivo`,
            estadoLeche: sql`excluded.estado_leche`,
            ultimoParto: sql`excluded.ultimo_parto`,
            ultimaInseminacion: sql`excluded.ultima_inseminacion`,
            totalIa: sql`excluded.total_ia`,
            diasEnLeche: sql`excluded.dias_en_leche`,
            diioMadre: sql`excluded.diio_madre`,
            padre: sql`excluded.padre`,
            origen: sql`excluded.origen`,
            fechaIngreso: sql`excluded.fecha_ingreso`,
            ultimoPesoKg: sql`excluded.ultimo_peso_kg`,
            ultimoPesoAt: sql`excluded.ultimo_peso_at`,
            observaciones: sql`excluded.observaciones`,
            ingestedAt: sql`now()`,
            sourceFile: sql`excluded.source_file`,
          },
        })
        .returning({ id: animales.id });
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
