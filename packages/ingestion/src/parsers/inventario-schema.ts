import { z } from "zod";

/**
 * Schema canónico de UNA fila de inventario AgroApp.
 * Se aplica DESPUÉS de la extracción por exceljs y ANTES
 * de que la fila entre a Bronze/Silver.
 *
 * Reglas:
 * - DIIO obligatorio, 7-9 dígitos (formato visual chileno)
 * - estado limitado a valores conocidos del dominio
 * - peso > 0 y < 2000 kg (cota física razonable)
 * - fechas válidas (Zod coerce desde Date|string)
 * - tipo_ganado conocido (Novillo / Vaquilla / Vaca / Toro / Ternero / Ternera)
 * - resto de campos opcionales (pueden venir vacíos)
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

const optionalInt = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  });

const optionalPeso = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n;
  })
  .refine((n) => n === null || (n > 0 && n < 2000), {
    message: "peso fuera de rango (0,2000) kg",
  })
  .transform((n) => (n === null ? null : n.toFixed(2)));

export const ESTADOS_VALIDOS = ["Vivo", "Vendido", "Muerto", "Faenado", "Baja"] as const;
export const TIPOS_GANADO_VALIDOS = [
  "Novillo",
  "Vaquilla",
  "Vaca",
  "Toro",
  "Torito",
  "Ternero",
  "Ternera",
] as const;

export const InventarioRowSchema = z.object({
  diio: z
    .string()
    .min(1, "DIIO vacío")
    .regex(/^\d{6,10}$/, "DIIO debe ser 6-10 dígitos"),
  estado: z.enum(ESTADOS_VALIDOS, {
    errorMap: () => ({
      message: `estado inválido (esperado uno de: ${ESTADOS_VALIDOS.join(", ")})`,
    }),
  }),
  tipo_ganado: z
    .union([z.enum(TIPOS_GANADO_VALIDOS), z.null()])
    .nullable()
    .optional(),
  fecha_nacimiento: optionalIsoDate,
  estado_reproductivo: optionalString,
  estado_leche: optionalString,
  ultimo_parto: optionalIsoDate,
  ultima_inseminacion: optionalIsoDate,
  total_ia: optionalInt,
  dias_en_leche: optionalInt,
  diio_madre: optionalString,
  padre: optionalString,
  origen: optionalString,
  fecha_creado: optionalIsoDate,
  fecha_pesaje: optionalIsoDate,
  peso: optionalPeso,
  observaciones: optionalString,
});

export type InventarioRowParsed = z.infer<typeof InventarioRowSchema>;

/** Formatea ZodError a string legible: "campo: mensaje; campo: mensaje". */
export function formatZodError(err: z.ZodError): string {
  return err.errors
    .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
    .join("; ");
}
