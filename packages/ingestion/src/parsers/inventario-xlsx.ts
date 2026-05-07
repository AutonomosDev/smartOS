import ExcelJS from "exceljs";
import {
  InventarioRowSchema,
  formatZodError,
} from "./inventario-schema.js";

/**
 * Mapeo de header literal del xlsx → key normalizada.
 * Si AgroApp cambia un header, sólo se ajusta acá.
 */
const HEADER_MAP: Record<string, string> = {
  "Diio": "diio",
  "Inventario": "estado",
  "Fecha nacimiento": "fecha_nacimiento",
  "Tipo ganado": "tipo_ganado",
  "Fundo": "fundo",
  "Estado reproductivo": "estado_reproductivo",
  "Estado leche": "estado_leche",
  "Observaciones": "observaciones",
  "Último parto": "ultimo_parto",
  "Última inseminación": "ultima_inseminacion",
  "Total IA": "total_ia",
  "Días En Leche": "dias_en_leche",
  "Diio Madre": "diio_madre",
  "Padre": "padre",
  "Origen": "origen",
  "Fecha creado": "fecha_creado",
  "Fecha Pesaje": "fecha_pesaje",
  "Peso": "peso",
};

export type SilverFields = {
  diio: string;
  estado: string;
  tipoGanado: string | null;
  fechaNacimiento: string | null;
  estadoReproductivo: string | null;
  estadoLeche: string | null;
  ultimoParto: string | null;
  ultimaInseminacion: string | null;
  totalIa: number | null;
  diasEnLeche: number | null;
  diioMadre: string | null;
  padre: string | null;
  origen: string | null;
  fechaIngreso: string | null;
  ultimoPesoKg: string | null;
  ultimoPesoAt: string | null;
  observaciones: string | null;
};

export type ParsedRow = {
  rowNumber: number;
  raw: Record<string, unknown>;
  silver: SilverFields;
};

export type ParseResult = {
  totalRows: number;
  validRows: ParsedRow[];
  errors: { rowNumber: number; reason: string }[];
};

export async function parseInventarioXlsx(
  buffer: Buffer
): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  // exceljs types lag behind @types/node 20.17+ — pass ArrayBuffer slice
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  await wb.xlsx.load(ab);

  const sheet = wb.worksheets[0];
  if (!sheet) {
    return { totalRows: 0, validRows: [], errors: [] };
  }

  const headers: (string | null)[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const label = String(cell.value ?? "").trim();
    headers[colNumber - 1] = HEADER_MAP[label] ?? null;
  });

  const validRows: ParsedRow[] = [];
  const errors: { rowNumber: number; reason: string }[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
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

    if (!hasAnyValue) continue;

    // Validar con Zod — schema canónico
    const result = InventarioRowSchema.safeParse(raw);
    if (!result.success) {
      errors.push({ rowNumber: r, reason: formatZodError(result.error) });
      continue;
    }

    const data = result.data;
    validRows.push({
      rowNumber: r,
      raw,
      silver: {
        diio: data.diio,
        estado: data.estado,
        tipoGanado: data.tipo_ganado ?? null,
        fechaNacimiento: data.fecha_nacimiento,
        estadoReproductivo: data.estado_reproductivo,
        estadoLeche: data.estado_leche,
        ultimoParto: data.ultimo_parto,
        ultimaInseminacion: data.ultima_inseminacion,
        totalIa: data.total_ia,
        diasEnLeche: data.dias_en_leche,
        diioMadre: data.diio_madre,
        padre: data.padre,
        origen: data.origen,
        fechaIngreso: data.fecha_creado,
        ultimoPesoKg: data.peso,
        ultimoPesoAt: data.fecha_pesaje,
        observaciones: data.observaciones,
      },
    });
  }

  return {
    totalRows: validRows.length + errors.length,
    validRows,
    errors,
  };
}
