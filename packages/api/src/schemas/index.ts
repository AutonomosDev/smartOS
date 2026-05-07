import { z } from "zod";

/**
 * Schemas de respuesta de la API ontológica.
 * Forman el contrato público entre servidor y cliente.
 * Usar `z.infer<typeof XxxSchema>` para tipos.
 */

export const AnimalSchema = z.object({
  diio: z.string(),
  tipoGanado: z.string().nullable(),
  estado: z.string(),
  fechaNacimiento: z.string().nullable(),
  fechaIngreso: z.string().nullable(),
  pesoActualKg: z.number().nullable(),
  ultimoPesoAt: z.string().nullable(),
  proveedor: z.string().nullable(),
  // métricas calculadas
  diasEstabulado: z.number().nullable(),
  pesoIngreso: z.number().nullable(),
  kgGanados: z.number().nullable(),
  gdpConfiable: z.number().nullable(),
  calidadGdp: z.enum(["confiable", "no_confiable_pocos_datos"]).nullable(),
  // estado comercial
  esVendible: z.boolean(),
  prioridadVenta: z
    .enum(["venta_inmediata", "venta_proxima_30d", "venta_proxima_60d", "no_aplica"])
    .nullable(),
  // alarmas
  enResguardoSanitario: z.boolean(),
  liberacionCarneAt: z.string().nullable(),
  esReclamable: z.boolean(),
});
export type Animal = z.infer<typeof AnimalSchema>;

export const PesajeSchema = z.object({
  diio: z.string(),
  fechaPesaje: z.string(),
  pesoKg: z.number(),
  edadMeses: z.number().nullable(),
  alaGalpon: z.string().nullable(),
  corral: z.string().nullable(),
  observaciones: z.string().nullable(),
  creadoPor: z.string().nullable(),
});
export type Pesaje = z.infer<typeof PesajeSchema>;

export const TratamientoSchema = z.object({
  diio: z.string(),
  fechaTratamiento: z.string(),
  diagnostico: z.string().nullable(),
  medicamentoNombre: z.string().nullable(),
  medicamentoSag: z.string().nullable(),
  via: z.string().nullable(),
  dosisMl: z.number().nullable(),
  resguardoCarneDias: z.number().nullable(),
  liberacionCarne: z.string().nullable(),
  liberacionLeche: z.string().nullable(),
  enResguardoActivo: z.boolean(),
});
export type Tratamiento = z.infer<typeof TratamientoSchema>;

export const VentaSchema = z.object({
  numeroVenta: z.number(),
  fechaVenta: z.string(),
  cantidadAnimales: z.number().nullable(),
  pesoTotalKg: z.number().nullable(),
  pesoPromedioKg: z.number().nullable(),
  estado: z.string().nullable(),
  creadoPor: z.string().nullable(),
});
export type Venta = z.infer<typeof VentaSchema>;

export const ProveedorSchema = z.object({
  nombre: z.string(),
  animalesActivos: z.number(),
  animalesEvaluables: z.number(),
  pesoActualAvg: z.number(),
  diasAvg: z.number(),
  gdpAvg: z.number().nullable(),
  gdpMin: z.number().nullable(),
  gdpMediana: z.number().nullable(),
  reclamables: z.number(),
  pctReclamable: z.number().nullable(),
});
export type Proveedor = z.infer<typeof ProveedorSchema>;

export const BajaSchema = z.object({
  diio: z.string(),
  fechaBaja: z.string(),
  motivo: z.string().nullable(),
  detalle: z.string().nullable(),
  tipoGanado: z.string().nullable(),
});
export type Baja = z.infer<typeof BajaSchema>;

export const AlarmaResguardoSchema = z.object({
  diio: z.string(),
  fechaTratamiento: z.string(),
  medicamentoNombre: z.string().nullable(),
  diagnostico: z.string().nullable(),
  liberacionCarne: z.string(),
  diasFaltantes: z.number(),
});
export type AlarmaResguardo = z.infer<typeof AlarmaResguardoSchema>;

export const DashboardCabeceraSchema = z.object({
  fechaReporte: z.string(),
  inventario: z.object({
    animalesActivos: z.number(),
    kgTotalesActivos: z.number(),
    pesoAvgActivos: z.number(),
  }),
  gdp: z.object({
    avgConfiable: z.number().nullable(),
    animalesEvaluables: z.number(),
  }),
  zonaVenta: z.object({
    animales: z.number(),
    valorEstimadoUsd: z.number(),
  }),
  alarmas: z.object({
    resguardoCarne: z.number(),
    reclamables: z.number(),
    sinPesar60d: z.number(),
    edadImposible: z.number(),
  }),
  historico: z.object({
    ventasTotal: z.number(),
    bajasTotal: z.number(),
    tratamientosTotal: z.number(),
    pctCojera: z.number(),
  }),
});
export type DashboardCabecera = z.infer<typeof DashboardCabeceraSchema>;
