import { z } from "zod";
import { TIPOS_GANADO_VALIDOS } from "./inventario-schema.js";

/**
 * Schema canónico de UNA fila de Pesajes_Historial AgroApp.
 * Aplicado entre extracción exceljs y entrada a Bronze/Silver.
 *
 * Reglas:
 * - DIIO obligatorio, 6-10 dígitos (rechaza "1" legacy)
 * - peso > 0 y < 2000 kg (rechaza valores corruptos como 3330)
 * - fecha_pesaje obligatoria, ISO date válida
 * - tipo_ganado opcional pero si viene debe ser conocido
 * - resto opcional
 */

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
  .refine((v) => v != null && v !== "", { message: "fecha_pesaje vacía" })
  .transform((v) => {
    const d = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(d.getTime())) {
      throw new Error("fecha_pesaje inválida");
    }
    return d.toISOString().slice(0, 10);
  });

const optionalEdadMeses = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n;
  })
  .refine((n) => n === null || (n >= 0 && n <= 600), {
    message: "edad fuera de rango [0, 600] meses (50 años max)",
  })
  .transform((n) => (n === null ? null : n.toFixed(1)));

const requiredPeso = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (v == null || v === "") return NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  })
  .refine((n) => n > 0 && n < 2000, {
    message: "peso fuera de rango (0,2000) kg",
  })
  .transform((n) => n.toFixed(2));

export const PesajeRowSchema = z.object({
  diio: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .pipe(
      z
        .string()
        .min(1, "DIIO vacío")
        .regex(/^\d{6,10}$/, "DIIO debe ser 6-10 dígitos")
    ),
  fecha_creado: requiredIsoDate, // Fecha del evento de pesaje
  peso: requiredPeso,
  edad_meses: optionalEdadMeses,
  tipo_ganado: z
    .union([z.enum(TIPOS_GANADO_VALIDOS), z.null(), z.undefined()])
    .nullable()
    .optional(),
  estado_reproductivo: optionalString,
  observaciones: optionalString,
  creado_por: optionalString,
});

export type PesajeRowParsed = z.infer<typeof PesajeRowSchema>;

export function formatZodError(err: z.ZodError): string {
  return err.errors
    .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
    .join("; ");
}

/**
 * Parsea la observación a (ala_galpon, corral, observaciones_libre).
 *
 * Reglas en orden:
 *   "4F"  → ala="4", corral="F"            (dígito + letra A-F)
 *   "B"   → ala=null, corral="B"           (solo letra A-F)
 *   otro  → ala=null, corral=null,
 *           observaciones_libre = obs raw  (PESAJE DESDE VENTA, cojo, ...)
 */
export function parseObservacion(raw: string | null | undefined): {
  alaGalpon: string | null;
  corral: string | null;
  observacionesLibre: string | null;
} {
  if (!raw) return { alaGalpon: null, corral: null, observacionesLibre: null };
  const v = raw.trim();
  if (v === "") return { alaGalpon: null, corral: null, observacionesLibre: null };

  const fullMatch = v.match(/^(\d+)([A-F])$/);
  if (fullMatch) {
    return {
      alaGalpon: fullMatch[1] ?? null,
      corral: fullMatch[2] ?? null,
      observacionesLibre: null,
    };
  }

  const letterOnly = v.match(/^([A-F])$/);
  if (letterOnly) {
    return {
      alaGalpon: null,
      corral: letterOnly[1] ?? null,
      observacionesLibre: null,
    };
  }

  return { alaGalpon: null, corral: null, observacionesLibre: v };
}
