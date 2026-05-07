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

export const tratamientosBronze = pgTable(
  "tratamientos_bronze",
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
    index("tratamientos_bronze_ingest_id_idx").on(t.ingestId),
    index("tratamientos_bronze_ingested_at_idx").on(t.ingestedAt),
  ]
);

export type TratamientoBronzeRow = typeof tratamientosBronze.$inferSelect;
export type NewTratamientoBronzeRow = typeof tratamientosBronze.$inferInsert;
