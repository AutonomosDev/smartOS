import { sql } from "drizzle-orm";
import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Silver: 1 fila por evento de pesaje (DIIO + fecha).
 * UNIQUE (diio, fecha_pesaje) → impide 2 pesajes el
 * mismo día (alarma operacional). Permite N pesajes
 * por animal en distintas fechas (= historia normal).
 */
export const pesajes = pgTable(
  "pesajes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    // Identificación + evento
    diio: text("diio").notNull(),
    fechaPesaje: date("fecha_pesaje").notNull(),
    pesoKg: numeric("peso_kg", { precision: 6, scale: 2 }).notNull(),

    // Atributos del animal al momento del pesaje
    edadMeses: numeric("edad_meses", { precision: 5, scale: 1 }),
    tipoGanado: text("tipo_ganado"),
    estadoReproductivo: text("estado_reproductivo"),

    // Ubicación parseada de la observación
    alaGalpon: text("ala_galpon"),
    corral: text("corral"),

    // Observaciones libres (PESAJE DESDE VENTA, cojo, neumonia, etc)
    observaciones: text("observaciones"),

    // Metadata operativa
    creadoPor: text("creado_por"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sourceFile: text("source_file"),
  },
  (t) => [
    uniqueIndex("pesajes_diio_fecha_idx").on(t.diio, t.fechaPesaje),
    index("pesajes_diio_fecha_desc_idx").on(t.diio, t.fechaPesaje),
    index("pesajes_ala_corral_idx").on(t.alaGalpon, t.corral),
  ]
);

export type Pesaje = typeof pesajes.$inferSelect;
export type NewPesaje = typeof pesajes.$inferInsert;
