import ExcelJS from "exceljs";
import {
  VentaCabeceraSchema,
  VentaDetalleSchema,
  formatZodError,
} from "./ventas-schema.js";

const HEADER_MAP_CABECERA: Record<string, string> = {
  "ID": "id_venta",
  "Fundo": "fundo",
  "N° Guía": "numero_guia",
  "Animales": "cantidad_animales",
  "Tipo ganado": "tipo_ganado_resumen",
  "Peso (kg)": "peso_total_kg",
  "Animales pesados": "cantidad_pesados",
  "Observaciones": "observaciones",
  "Estado": "estado",
  "Fecha venta": "fecha_venta",
  "Creado por": "creado_por",
  "Fecha creado": "fecha_creado",
};

const HEADER_MAP_DETALLE: Record<string, string> = {
  "ID": "id_venta",
  "Diio": "diio",
  "Tipo ganado": "tipo_ganado",
  "Estado Reproductivo": "estado_reproductivo",
  "Estado leche": "estado_leche",
  "Peso (kg)": "peso_kg",
  "Mangada": "mangada",
};

export type ParsedCabecera = {
  rowNumber: number;
  raw: Record<string, unknown>;
  silver: {
    numeroVenta: number;
    fechaVenta: string;
    cantidadAnimales: number | null;
    cantidadPesados: number | null;
    pesoTotalKg: string | null;
    tipoGanadoResumen: string | null;
    estado: string | null;
    observaciones: string | null;
    creadoPor: string | null;
    fechaCreadoSistema: string | null;
  };
};

export type ParsedDetalle = {
  rowNumber: number;
  raw: Record<string, unknown>;
  silver: {
    numeroVenta: number;
    diio: string;
    tipoGanado: string | null;
    estadoReproductivo: string | null;
    estadoLeche: string | null;
    pesoKg: string | null;
    mangada: number | null;
  };
};

export type ParseCabeceraResult = {
  totalRows: number;
  validRows: ParsedCabecera[];
  errors: { rowNumber: number; reason: string }[];
};

export type ParseDetalleResult = {
  totalRows: number;
  validRows: ParsedDetalle[];
  errors: { rowNumber: number; reason: string }[];
};

async function loadSheet(buffer: Buffer): Promise<ExcelJS.Worksheet | null> {
  const wb = new ExcelJS.Workbook();
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  await wb.xlsx.load(ab);
  return wb.worksheets[0] ?? null;
}

function readHeaders(
  sheet: ExcelJS.Worksheet,
  map: Record<string, string>
): (string | null)[] {
  const headers: (string | null)[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const label = String(cell.value ?? "").trim();
    headers[colNumber - 1] = map[label] ?? null;
  });
  return headers;
}

function readRow(
  sheet: ExcelJS.Worksheet,
  r: number,
  headers: (string | null)[]
): { raw: Record<string, unknown>; hasAnyValue: boolean } {
  const row = sheet.getRow(r);
  const raw: Record<string, unknown> = {};
  let hasAnyValue = false;
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const key = headers[colNumber - 1];
    if (!key) return;
    const v = cell.value;
    if (v != null && v !== "") hasAnyValue = true;
    raw[key] = v instanceof Date ? v.toISOString() : v;
  });
  return { raw, hasAnyValue };
}

export async function parseVentasCabeceraXlsx(
  buffer: Buffer
): Promise<ParseCabeceraResult> {
  const sheet = await loadSheet(buffer);
  if (!sheet) return { totalRows: 0, validRows: [], errors: [] };

  const headers = readHeaders(sheet, HEADER_MAP_CABECERA);
  const validRows: ParsedCabecera[] = [];
  const errors: { rowNumber: number; reason: string }[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const { raw, hasAnyValue } = readRow(sheet, r, headers);
    if (!hasAnyValue) continue;

    const result = VentaCabeceraSchema.safeParse(raw);
    if (!result.success) {
      errors.push({ rowNumber: r, reason: formatZodError(result.error) });
      continue;
    }

    const d = result.data;
    validRows.push({
      rowNumber: r,
      raw,
      silver: {
        numeroVenta: d.id_venta,
        fechaVenta: d.fecha_venta,
        cantidadAnimales: d.cantidad_animales,
        cantidadPesados: d.cantidad_pesados,
        pesoTotalKg: d.peso_total_kg,
        tipoGanadoResumen: d.tipo_ganado_resumen,
        estado: d.estado,
        observaciones: d.observaciones,
        creadoPor: d.creado_por,
        fechaCreadoSistema: d.fecha_creado,
      },
    });
  }

  return { totalRows: validRows.length + errors.length, validRows, errors };
}

export async function parseVentasDetalleXlsx(
  buffer: Buffer
): Promise<ParseDetalleResult> {
  const sheet = await loadSheet(buffer);
  if (!sheet) return { totalRows: 0, validRows: [], errors: [] };

  const headers = readHeaders(sheet, HEADER_MAP_DETALLE);
  const validRows: ParsedDetalle[] = [];
  const errors: { rowNumber: number; reason: string }[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const { raw, hasAnyValue } = readRow(sheet, r, headers);
    if (!hasAnyValue) continue;

    const result = VentaDetalleSchema.safeParse(raw);
    if (!result.success) {
      errors.push({ rowNumber: r, reason: formatZodError(result.error) });
      continue;
    }

    const d = result.data;
    validRows.push({
      rowNumber: r,
      raw,
      silver: {
        numeroVenta: d.id_venta,
        diio: d.diio,
        tipoGanado: d.tipo_ganado ?? null,
        estadoReproductivo: d.estado_reproductivo,
        estadoLeche: d.estado_leche,
        pesoKg: d.peso_kg,
        mangada: d.mangada,
      },
    });
  }

  return { totalRows: validRows.length + errors.length, validRows, errors };
}
