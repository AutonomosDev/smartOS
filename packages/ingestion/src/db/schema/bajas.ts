import { sql } from "drizzle-orm";
import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Silver — bajas de animales.
 * 1 fila por animal dado de baja. UNIQUE(diio): un
 * animal solo puede salir del sistema UNA vez.
 */
export const bajas = pgTable(
  "bajas",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    diio: text("diio").notNull(),
    fechaBaja: date("fecha_baja").notNull(),

    motivo: text("motivo"),               // Muerte | Accidente | ...
    detalle: text("detalle"),             // causa específica

    tipoGanado: text("tipo_ganado"),
    fechaNacimiento: date("fecha_nacimiento"),
    estadoReproductivo: text("estado_reproductivo"),
    observaciones: text("observaciones"),

    creadoPor: text("creado_por"),
    fechaCreadoSistema: timestamp("fecha_creado_sistema", {
      withTimezone: true,
    }),

    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sourceFile: text("source_file"),
  },
  (t) => [
    uniqueIndex("bajas_diio_idx").on(t.diio),
    index("bajas_fecha_idx").on(t.fechaBaja),
    index("bajas_motivo_idx").on(t.motivo),
  ]
);

export type Baja = typeof bajas.$inferSelect;
export type NewBaja = typeof bajas.$inferInsert;
