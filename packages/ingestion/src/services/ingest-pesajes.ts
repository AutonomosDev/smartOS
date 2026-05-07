import { sql } from "drizzle-orm";
import { TENANCY } from "../config/tenancy.js";
import { db } from "../db/client.js";
import { landings, pesajes, pesajesBronze } from "../db/schema/index.js";
import {
  type Alarm,
  parsePesajesXlsx,
} from "../parsers/pesajes-xlsx.js";
import { uploadRaw } from "../storage/gcs.js";

const KIND = "pesajes";

function operacionSlug(): string {
  return TENANCY.operacion.nombre.toLowerCase().replace(/\s+/g, "-");
}

export type IngestPesajesResult = {
  ingestId: string;
  landingId: string;
  gcsUri: string;
  sourceFile: string;
  totalRows: number;
  bronzeInserted: number;
  silverInserted: number;
  silverAlreadyExisted: number;
  errors: { rowNumber: number; reason: string }[];
  alarms: Alarm[];
};

export async function ingestPesajes(
  buffer: Buffer,
  sourceFile: string
): Promise<IngestPesajesResult> {
  const operacion = operacionSlug();

  // 0) Landing crudo en GCS
  const meta = await uploadRaw({
    kind: KIND,
    operacion,
    fileName: sourceFile,
    buffer,
  });

  const parsed = await parsePesajesXlsx(buffer);

  return await db.transaction(async (tx) => {
    // 1) Landing
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
        alarms: parsed.alarms,
      };
    }

    // 2) Bronze: append todas las filas válidas
    const bronzeValues = parsed.validRows.map((r) => ({
      ingestId: landing.ingestId,
      sourceFile,
      rowNumber: r.rowNumber,
      raw: r.raw,
    }));

    const CHUNK = 1000;
    let bronzeInserted = 0;
    for (let i = 0; i < bronzeValues.length; i += CHUNK) {
      const slice = bronzeValues.slice(i, i + CHUNK);
      const inserted = await tx
        .insert(pesajesBronze)
        .values(slice)
        .returning({ id: pesajesBronze.id });
      bronzeInserted += inserted.length;
    }

    // 3) Silver: insert con onConflictDoNothing por (diio, fecha_pesaje)
    //    Re-uploads del mismo evento NO duplican.
    //    Conflict cross-archivo se cuenta como "ya existía".
    const silverValues = parsed.validRows.map((r) => ({
      diio: r.silver.diio,
      fechaPesaje: r.silver.fechaPesaje,
      pesoKg: r.silver.pesoKg,
      edadMeses: r.silver.edadMeses,
      tipoGanado: r.silver.tipoGanado,
      estadoReproductivo: r.silver.estadoReproductivo,
      alaGalpon: r.silver.alaGalpon,
      corral: r.silver.corral,
      observaciones: r.silver.observaciones,
      creadoPor: r.silver.creadoPor,
      sourceFile,
    }));

    let silverInserted = 0;
    for (let i = 0; i < silverValues.length; i += CHUNK) {
      const slice = silverValues.slice(i, i + CHUNK);
      const inserted = await tx
        .insert(pesajes)
        .values(slice)
        .onConflictDoNothing({
          target: [pesajes.diio, pesajes.fechaPesaje],
        })
        .returning({ id: pesajes.id });
      silverInserted += inserted.length;
    }

    const silverAlreadyExisted = parsed.validRows.length - silverInserted;

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
      alarms: parsed.alarms,
    };
  });
}
