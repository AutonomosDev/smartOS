import { z } from "zod";
import { TIPOS_GANADO_VALIDOS } from "./inventario-schema.js";

const optionalString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === "" ? null : String(v).trim()));

const optionalIsoDate = z
  .union([z.string(), z.date(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const d = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  });

const requiredIsoDate = z
  .union([z.string(), z.date()])
  .refine((v) => v != null && v !== "", { message: "fecha vacía" })
  .transform((v) => {
    const d = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(d.getTime())) {
      throw new Error("fecha inválida");
    }
    return d.toISOString().slice(0, 10);
  });

const optionalInt = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  });

const requiredInt = z
  .union([z.number(), z.string()])
  .transform((v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error("entero inválido");
    return Math.trunc(n);
  });

const optionalNumeric = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n.toFixed(2);
  });

/** Cabecera del archivo Ventas_Historial */
export const VentaCabeceraSchema = z.object({
  id_venta: requiredInt,
  fundo: optionalString,
  numero_guia: optionalString,                // ignorado en Silver
  cantidad_animales: optionalInt,
  tipo_ganado_resumen: optionalString,        // ej "Novillo: 45"
  peso_total_kg: optionalNumeric,
  cantidad_pesados: optionalInt,
  observaciones: optionalString,
  estado: optionalString,
  fecha_venta: requiredIsoDate,
  creado_por: optionalString,
  fecha_creado: optionalIsoDate,
});

export type VentaCabeceraParsed = z.infer<typeof VentaCabeceraSchema>;

/** Detalle: 1 fila por animal vendido. */
export const VentaDetalleSchema = z.object({
  id_venta: requiredInt,
  diio: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .pipe(
      z
        .string()
        .min(1, "DIIO vacío")
        .regex(/^\d{6,10}$/, "DIIO debe ser 6-10 dígitos")
    ),
  tipo_ganado: z
    .union([z.enum(TIPOS_GANADO_VALIDOS), z.null(), z.undefined()])
    .nullable()
    .optional(),
  estado_reproductivo: optionalString,
  estado_leche: optionalString,
  peso_kg: optionalNumeric,
  mangada: optionalInt,
});

export type VentaDetalleParsed = z.infer<typeof VentaDetalleSchema>;

export function formatZodError(err: z.ZodError): string {
  return err.errors
    .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
    .join("; ");
}
