import { sql } from "drizzle-orm";
import { TENANCY } from "../config/tenancy.js";
import { db } from "../db/client.js";
import {
  landings,
  tratamientos,
  tratamientosBronze,
} from "../db/schema/index.js";
import {
  type Discrepancia,
  parseTratamientosXlsx,
} from "../parsers/tratamientos-xlsx.js";
import { uploadRaw } from "../storage/gcs.js";

const KIND = "tratamientos";

function operacionSlug(): string {
  return TENANCY.operacion.nombre.toLowerCase().replace(/\s+/g, "-");
}

export type IngestTratamientosResult = {
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
};

export async function ingestTratamientos(
  buffer: Buffer,
  sourceFile: string
): Promise<IngestTratamientosResult> {
  const operacion = operacionSlug();

  const meta = await uploadRaw({
    kind: KIND,
    operacion,
    fileName: sourceFile,
    buffer,
  });

  const parsed = await parseTratamientosXlsx(buffer);

  return await db.transaction(async (tx) => {
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
        discrepancias: parsed.discrepancias,
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
        .insert(tratamientosBronze)
        .values(slice)
        .returning({ id: tratamientosBronze.id });
      bronzeInserted += inserted.length;
    }

    const silverValues = parsed.validRows.map((r) => ({
      diio: r.silver.diio,
      fechaTratamiento: r.silver.fechaTratamiento,
      diagnostico: r.silver.diagnostico,
      medicamentoNombre: r.silver.medicamentoNombre,
      medicamentoSag: r.silver.medicamentoSag,
      medicamentoRaw: r.silver.medicamentoRaw,
      serie: r.silver.serie,
      vencimiento: r.silver.vencimiento,
      via: r.silver.via,
      dosisRaw: r.silver.dosisRaw,
      dosisMl: r.silver.dosisMl,
      repetirCadaDias: r.silver.repetirCadaDias,
      repetirVeces: r.silver.repetirVeces,
      inicio: r.silver.inicio,
      fin: r.silver.fin,
      resguardoLecheDias: r.silver.resguardoLecheDias,
      resguardoCarneDias: r.silver.resguardoCarneDias,
      liberacionLeche: r.silver.liberacionLeche,
      liberacionCarne: r.silver.liberacionCarne,
      observaciones: r.silver.observaciones,
      creadoPor: r.silver.creadoPor,
      fechaCreadoSistema: r.silver.fechaCreadoSistema
        ? new Date(r.silver.fechaCreadoSistema)
        : null,
      contentHash: r.silver.contentHash,
      sourceFile,
    }));

    let silverInserted = 0;
    for (let i = 0; i < silverValues.length; i += CHUNK) {
      const slice = silverValues.slice(i, i + CHUNK);
      const inserted = await tx
        .insert(tratamientos)
        .values(slice)
        .onConflictDoNothing({ target: tratamientos.contentHash })
        .returning({ id: tratamientos.id });
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
      discrepancias: parsed.discrepancias,
    };
  });
}
