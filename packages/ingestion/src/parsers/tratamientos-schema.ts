import { z } from "zod";
import { TIPOS_GANADO_VALIDOS } from "./inventario-schema.js";

/**
 * Schema canónico de UNA fila de Tratamientos_Historial AgroApp.
 *
 * Aplicado entre extracción exceljs y entrada a Bronze/Silver.
 * Las columnas vienen como strings (xlsx) — Zod coerce.
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
  .refine((v) => v != null && v !== "", { message: "fecha vacía" })
  .transform((v) => {
    const d = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(d.getTime())) {
      throw new Error("fecha inválida");
    }
    return d.toISOString().slice(0, 10);
  });

export const TratamientoRowSchema = z.object({
  id_agroapp: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v == null ? null : String(v))),
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
  fecha_tratamiento: requiredIsoDate,
  diagnostico: optionalString,
  observaciones: optionalString,
  medicamento: optionalString,           // ej "Tylan 200 - 967-B"
  serie_venc: optionalString,            // ej "4265-90B - 05/2026"
  via: optionalString,
  dosis: optionalString,                 // ej "30 ML"
  repetir_cada: optionalString,          // ej "0 ", "1 Días", "0.5 Días"
  repetir_veces: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }),
  inicio: optionalIsoDate,
  fin: optionalIsoDate,
  resguardo_leche: optionalString,       // ej "4 Días"
  resguardo_carne: optionalString,       // ej "21 Días"
  liberacion_leche_xlsx: optionalIsoDate,
  liberacion_carne_xlsx: optionalIsoDate,
  creado_por: optionalString,
  fecha_creado: optionalIsoDate,
});

export type TratamientoRowParsed = z.infer<typeof TratamientoRowSchema>;

export function formatZodError(err: z.ZodError): string {
  return err.errors
    .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
    .join("; ");
}

/**
 * Parsea "Tylan 200 - 967-B" → { nombre: "Tylan 200", sag: "967-B" }
 * Si no matchea → fallback en raw.
 */
export function parseMedicamento(raw: string | null): {
  nombre: string | null;
  sag: string | null;
  raw: string | null;
} {
  if (!raw) return { nombre: null, sag: null, raw: null };
  const v = raw.trim();
  const m = v.match(/^(.+?)\s*-\s*([A-Z0-9-]+)$/);
  if (m) {
    return { nombre: m[1]?.trim() ?? null, sag: m[2]?.trim() ?? null, raw: v };
  }
  return { nombre: v, sag: null, raw: v };
}

/**
 * Parsea "4265-90B - 05/2026" → { serie: "4265-90B", venc: "2026-05-31" }
 * Vencimiento se convierte a último día del mes.
 */
export function parseSerieVenc(raw: string | null): {
  serie: string | null;
  vencimiento: string | null;
} {
  if (!raw) return { serie: null, vencimiento: null };
  const v = raw.trim();
  const m = v.match(/^(.+?)\s*-\s*(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (month >= 1 && month <= 12) {
      // último día del mes (ISO date)
      const last = new Date(Date.UTC(year, month, 0));
      const iso = last.toISOString().slice(0, 10);
      return { serie: m[1]?.trim() ?? null, vencimiento: iso };
    }
  }
  return { serie: v, vencimiento: null };
}

/** Parsea "30 ML" → 30 (mililitros). Devuelve null si no detecta número. */
export function parseDosisMl(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^([\d.,]+)/);
  if (!m) return null;
  const n = Number((m[1] ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

/** Parsea "21 Días" → 21. Devuelve null si no detecta número. */
export function parseDiasInt(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Parsea "0.5 Días" → 0.5 (numeric, admite fracciones). */
export function parseDiasNumeric(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^([\d.,]+)/);
  if (!m) return null;
  const n = Number((m[1] ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

/** Suma `dias` a una fecha ISO yyyy-mm-dd. Devuelve nueva fecha ISO. */
export function addDays(isoDate: string, dias: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
