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
 * Silver: 1 fila por medicamento aplicado.
 *
 * Identidad por content_hash UNIQUE (md5 de los campos
 * relevantes). Permite múltiples aplicaciones del mismo
 * medicamento al mismo animal mismo día (cada 8h, 12h).
 *
 * Resguardos sanitarios SAG son CRÍTICOS legalmente:
 * los campos `liberacion_leche` y `liberacion_carne` se
 * calculan ACÁ desde fecha_tratamiento + resguardo_*_dias.
 * Si difieren del campo del xlsx → alarma de discrepancia.
 */
export const tratamientos = pgTable(
  "tratamientos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

    // Identificación
    diio: text("diio").notNull(),
    fechaTratamiento: date("fecha_tratamiento").notNull(),
    diagnostico: text("diagnostico"),

    // Medicamento (parseado de "Nombre - 967-B")
    medicamentoNombre: text("medicamento_nombre"),
    medicamentoSag: text("medicamento_sag"),
    medicamentoRaw: text("medicamento_raw"),

    // Lote del producto (parseado de "4265-90B - 05/2026")
    serie: text("serie"),
    vencimiento: date("vencimiento"),

    // Aplicación
    via: text("via"),
    dosisRaw: text("dosis_raw"),
    dosisMl: numeric("dosis_ml", { precision: 8, scale: 2 }),

    // Ciclo de tratamiento (numeric admite fracciones de día)
    repetirCadaDias: numeric("repetir_cada_dias", { precision: 5, scale: 2 }),
    repetirVeces: integer("repetir_veces"),
    inicio: date("inicio"),
    fin: date("fin"),

    // Resguardo SAG (CRÍTICO)
    resguardoLecheDias: integer("resguardo_leche_dias"),
    resguardoCarneDias: integer("resguardo_carne_dias"),
    liberacionLeche: date("liberacion_leche"),     // calculado por nosotros
    liberacionCarne: date("liberacion_carne"),     // calculado por nosotros

    // Operacional
    observaciones: text("observaciones"),
    creadoPor: text("creado_por"),
    fechaCreadoSistema: timestamp("fecha_creado_sistema", {
      withTimezone: true,
    }),

    // Idempotencia
    contentHash: text("content_hash").notNull(),

    // Metadata ingesta
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sourceFile: text("source_file"),
  },
  (t) => [
    uniqueIndex("tratamientos_content_hash_idx").on(t.contentHash),
    index("tratamientos_diio_fecha_desc_idx").on(t.diio, t.fechaTratamiento),
    index("tratamientos_liberacion_carne_idx").on(t.liberacionCarne),
    index("tratamientos_liberacion_leche_idx").on(t.liberacionLeche),
    index("tratamientos_medicamento_sag_idx").on(t.medicamentoSag),
  ]
);

export type Tratamiento = typeof tratamientos.$inferSelect;
export type NewTratamiento = typeof tratamientos.$inferInsert;
