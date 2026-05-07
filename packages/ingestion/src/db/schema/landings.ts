import { sql } from "drizzle-orm";
import {
  bigint,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Landing: 1 fila por upload de archivo crudo en GCS.
 * Existe ANTES de Bronze. Si Bronze se corrompe, se
 * reprocesa desde acá apuntando al objeto en GCS.
 *
 * `ingest_id` es el mismo que se inserta en
 * `inventario_bronze.ingest_id` (soft FK por valor).
 */
export const landings = pgTable(
  "landings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ingestId: uuid("ingest_id").notNull().default(sql`gen_random_uuid()`),
    kind: text("kind").notNull(),                // ej "inventario"
    operacion: text("operacion").notNull(),       // ej "los-lagos"
    sourceFile: text("source_file").notNull(),
    gcsUri: text("gcs_uri").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
    fileMd5: text("file_md5").notNull(),
    contentType: text("content_type"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("landings_ingest_id_idx").on(t.ingestId)]
);

export type Landing = typeof landings.$inferSelect;
export type NewLanding = typeof landings.$inferInsert;
