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

export const BajaRowSchema = z.object({
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
  fecha_nacimiento: optionalIsoDate,
  estado_reproductivo: optionalString,
  estado_leche: optionalString,
  motivo: optionalString,
  detalle: optionalString,
  fecha_baja: requiredIsoDate,
  creado_por: optionalString,
  fecha_creado: optionalIsoDate,
});

export type BajaRowParsed = z.infer<typeof BajaRowSchema>;

export function formatZodError(err: z.ZodError): string {
  return err.errors
    .map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`)
    .join("; ");
}
