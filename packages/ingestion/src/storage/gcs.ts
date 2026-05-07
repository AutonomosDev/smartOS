import { createHash } from "node:crypto";
import { Storage } from "@google-cloud/storage";

/**
 * Cliente GCS — apunta al emulador fake-gcs en local
 * y al GCS real cuando GCS_EMULATOR_URL está vacío.
 *
 * Para fake-gcs:
 *  - apiEndpoint mantiene el prefijo /storage/v1 que
 *    fake-gcs respeta (a diferencia de STORAGE_EMULATOR_HOST
 *    que en este SDK lo omite y rompe el path).
 *  - useAuthWithCustomEndpoint:false desactiva OAuth.
 */
const apiEndpoint = process.env.GCS_EMULATOR_URL || undefined;

export const storage = new Storage(
  apiEndpoint
    ? {
        apiEndpoint,
        projectId: "smartos-local",
        useAuthWithCustomEndpoint: false,
      }
    : { projectId: process.env.GCP_PROJECT_ID }
);

export const BUCKET_NAME = process.env.GCS_BUCKET ?? "smartos-raw-local";

const bucket = storage.bucket(BUCKET_NAME);

let bucketReady = false;

/** Asegura que el bucket exista (idempotente, fake-gcs lo necesita). */
async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const [exists] = await bucket.exists();
  if (!exists) {
    await storage.createBucket(BUCKET_NAME);
  }
  bucketReady = true;
}

/** ISO compacto sin separadores: 20260507T164300Z */
function timestampForPath(d = new Date()): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export type LandingMeta = {
  gcsUri: string;
  objectPath: string;
  fileSizeBytes: number;
  fileMd5: string;
  contentType: string;
};

/**
 * Sube el archivo crudo a GCS bronze layout:
 *   {kind}/operacion={operacion}/{ts}_{filename}
 * Devuelve metadata para guardar en `landings`.
 */
export async function uploadRaw(args: {
  kind: string;
  operacion: string;
  fileName: string;
  buffer: Buffer;
  contentType?: string;
}): Promise<LandingMeta> {
  await ensureBucket();

  const ts = timestampForPath();
  const safeName = args.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `${args.kind}/operacion=${args.operacion}/${ts}_${safeName}`;
  const file = bucket.file(objectPath);

  const contentType =
    args.contentType ??
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  await file.save(args.buffer, {
    contentType,
    resumable: false,
    metadata: { contentType },
  });

  const fileMd5 = createHash("md5").update(args.buffer).digest("hex");

  return {
    gcsUri: `gs://${BUCKET_NAME}/${objectPath}`,
    objectPath,
    fileSizeBytes: args.buffer.byteLength,
    fileMd5,
    contentType,
  };
}
