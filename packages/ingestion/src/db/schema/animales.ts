import { sql } from "drizzle-orm";
import {
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Silver: estado actual de cada animal.
 * Mapeo 1:1 con las 18 columnas del xlsx de inventario AgroApp,
 * excepto "Fundo" (omitido — redundante con TENANCY).
 *
 * `origen` (proveedor) y `padre` se guardan como string.
 * Cuando aparezca analítica de proveedores se promueven a tabla.
 */
export const animales = pgTable("animales", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

  // Identificación
  diio: text("diio").notNull().unique(),
  estado: text("estado").notNull(),                       // Inventario
  tipoGanado: text("tipo_ganado"),
  fechaNacimiento: date("fecha_nacimiento"),

  // Reproducción
  estadoReproductivo: text("estado_reproductivo"),
  estadoLeche: text("estado_leche"),
  ultimoParto: date("ultimo_parto"),
  ultimaInseminacion: date("ultima_inseminacion"),
  totalIa: integer("total_ia"),
  diasEnLeche: integer("dias_en_leche"),

  // Genealogía
  diioMadre: text("diio_madre"),
  padre: text("padre"),

  // Origen comercial
  origen: text("origen"),                                 // proveedor (string)
  fechaIngreso: date("fecha_ingreso"),                    // alta en Los Lagos

  // Último pesaje
  ultimoPesoKg: numeric("ultimo_peso_kg", { precision: 6, scale: 2 }),
  ultimoPesoAt: date("ultimo_peso_at"),

  // Otros
  observaciones: text("observaciones"),

  // Metadata
  ingestedAt: timestamp("ingested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  sourceFile: text("source_file"),
});

export type Animal = typeof animales.$inferSelect;
export type NewAnimal = typeof animales.$inferInsert;
