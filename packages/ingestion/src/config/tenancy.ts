/**
 * Tenancy del MVP — 1 sola empresa, 1 sola operación.
 *
 * Cuando aparezca un segundo cliente o una segunda
 * operación, esto se convierte en tablas Postgres
 * (empresas / operaciones) con FK desde `animales`.
 */
export const TENANCY = {
  empresa: {
    razonSocial: "Agrícola Mollendo SA",
    alias: "AMSA",
  },
  operacion: {
    nombre: "Los Lagos",
  },
} as const;

export type Tenancy = typeof TENANCY;
