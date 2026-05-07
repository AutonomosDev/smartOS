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

export const ventasBronze = pgTable(
  "ventas_bronze",
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
    index("ventas_bronze_ingest_id_idx").on(t.ingestId),
    index("ventas_bronze_ingested_at_idx").on(t.ingestedAt),
  ]
);

export type VentaBronzeRow = typeof ventasBronze.$inferSelect;
export type NewVentaBronzeRow = typeof ventasBronze.$inferInsert;

export const ventasAnimalesBronze = pgTable(
  "ventas_animales_bronze",
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
    index("ventas_animales_bronze_ingest_id_idx").on(t.ingestId),
    index("ventas_animales_bronze_ingested_at_idx").on(t.ingestedAt),
  ]
);

export type VentaAnimalBronzeRow = typeof ventasAnimalesBronze.$inferSelect;
export type NewVentaAnimalBronzeRow = typeof ventasAnimalesBronze.$inferInsert;
