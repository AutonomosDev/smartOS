import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Silver — cabecera de venta.
 * 1 fila por venta. numero_venta es el id de negocio
 * (referenciable externamente, único).
 */
export const ventas = pgTable(
  "ventas",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    numeroVenta: integer("numero_venta").notNull(),
    fechaVenta: date("fecha_venta").notNull(),

    cantidadAnimales: integer("cantidad_animales"),
    cantidadPesados: integer("cantidad_pesados"),
    pesoTotalKg: numeric("peso_total_kg", { precision: 10, scale: 2 }),
    tipoGanadoResumen: text("tipo_ganado_resumen"),

    estado: text("estado"),
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
    uniqueIndex("ventas_numero_venta_idx").on(t.numeroVenta),
    index("ventas_fecha_idx").on(t.fechaVenta),
  ]
);

export type Venta = typeof ventas.$inferSelect;
export type NewVenta = typeof ventas.$inferInsert;

/**
 * Silver — detalle de venta.
 * 1 fila por animal vendido. FK estricta a ventas.
 */
export const ventasAnimales = pgTable(
  "ventas_animales",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ventaId: uuid("venta_id")
      .notNull()
      .references(() => ventas.id, { onDelete: "restrict" }),
    numeroVenta: integer("numero_venta").notNull(),

    diio: text("diio").notNull(),
    tipoGanado: text("tipo_ganado"),
    estadoReproductivo: text("estado_reproductivo"),
    estadoLeche: text("estado_leche"),
    pesoKg: numeric("peso_kg", { precision: 7, scale: 2 }),
    mangada: integer("mangada"),

    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sourceFile: text("source_file"),
  },
  (t) => [
    uniqueIndex("ventas_animales_venta_diio_idx").on(t.ventaId, t.diio),
    index("ventas_animales_diio_idx").on(t.diio),
    index("ventas_animales_numero_venta_idx").on(t.numeroVenta),
  ]
);

export type VentaAnimal = typeof ventasAnimales.$inferSelect;
export type NewVentaAnimal = typeof ventasAnimales.$inferInsert;
