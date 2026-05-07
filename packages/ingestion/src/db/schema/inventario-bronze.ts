import { sql } from "drizzle-orm";
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Bronze: data raw del xlsx, append-only.
 * Cada upload genera N filas (1 por fila del xlsx).
 * `ingest_id` agrupa todas las filas del mismo upload.
 * Nunca se borra ni se edita. Audit trail.
 */
export const inventarioBronze = pgTable(
  "inventario_bronze",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ingestId: uuid("ingest_id").notNull().default(sql`gen_random_uuid()`),
    sourceFile: text("source_file").notNull(),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("inventario_bronze_ingest_id_idx").on(t.ingestId),
    index("inventario_bronze_ingested_at_idx").on(t.ingestedAt),
  ]
);

export type InventarioBronzeRow = typeof inventarioBronze.$inferSelect;
export type NewInventarioBronzeRow = typeof inventarioBronze.$inferInsert;
