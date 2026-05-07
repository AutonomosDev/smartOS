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
 * Bronze para pesajes — append-only, audit completo.
 * Mismo patrón que inventario_bronze.
 */
export const pesajesBronze = pgTable(
  "pesajes_bronze",
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
    index("pesajes_bronze_ingest_id_idx").on(t.ingestId),
    index("pesajes_bronze_ingested_at_idx").on(t.ingestedAt),
  ]
);

export type PesajeBronzeRow = typeof pesajesBronze.$inferSelect;
export type NewPesajeBronzeRow = typeof pesajesBronze.$inferInsert;
