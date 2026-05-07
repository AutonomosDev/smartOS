import { TENANCY } from "../config/tenancy.js";
import { db } from "../db/client.js";
import { bajas, bajasBronze, landings } from "../db/schema/index.js";
import { parseBajasXlsx } from "../parsers/bajas-xlsx.js";
import { uploadRaw } from "../storage/gcs.js";

const KIND = "bajas";

function operacionSlug(): string {
  return TENANCY.operacion.nombre.toLowerCase().replace(/\s+/g, "-");
}

export type IngestBajasResult = {
  ingestId: string;
  landingId: string;
  gcsUri: string;
  sourceFile: string;
  totalRows: number;
  bronzeInserted: number;
  silverInserted: number;
  silverAlreadyExisted: number;
  errors: { rowNumber: number; reason: string }[];
};

export async function ingestBajas(
  buffer: Buffer,
  sourceFile: string
): Promise<IngestBajasResult> {
  const operacion = operacionSlug();
  const meta = await uploadRaw({
    kind: KIND,
    operacion,
    fileName: sourceFile,
    buffer,
  });
  const parsed = await parseBajasXlsx(buffer);

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
        .insert(bajasBronze)
        .values(slice)
        .returning({ id: bajasBronze.id });
      bronzeInserted += inserted.length;
    }

    const silverValues = parsed.validRows.map((r) => ({
      diio: r.silver.diio,
      fechaBaja: r.silver.fechaBaja,
      motivo: r.silver.motivo,
      detalle: r.silver.detalle,
      tipoGanado: r.silver.tipoGanado,
      fechaNacimiento: r.silver.fechaNacimiento,
      estadoReproductivo: r.silver.estadoReproductivo,
      observaciones: r.silver.observaciones,
      creadoPor: r.silver.creadoPor,
      fechaCreadoSistema: r.silver.fechaCreadoSistema
        ? new Date(r.silver.fechaCreadoSistema)
        : null,
      sourceFile,
    }));

    let silverInserted = 0;
    for (let i = 0; i < silverValues.length; i += CHUNK) {
      const slice = silverValues.slice(i, i + CHUNK);
      const inserted = await tx
        .insert(bajas)
        .values(slice)
        .onConflictDoNothing({ target: bajas.diio })
        .returning({ id: bajas.id });
      silverInserted += inserted.length;
    }

    return {
      ingestId: landing.ingestId,
      landingId: landing.id,
      gcsUri: meta.gcsUri,
      sourceFile,
      totalRows: parsed.totalRows,
      bronzeInserted,
      silverInserted,
      silverAlreadyExisted: parsed.validRows.length - silverInserted,
      errors: parsed.errors,
    };
  });
}
