import ExcelJS from "exceljs";
import { BajaRowSchema, formatZodError } from "./bajas-schema.js";

const HEADER_MAP: Record<string, string> = {
  "Diio": "diio",
  "Fundo": "fundo",
  "Tipo ganado": "tipo_ganado",
  "Fecha nacimiento": "fecha_nacimiento",
  "Estado reproductivo": "estado_reproductivo",
  "Estado leche": "estado_leche",
  "Motivo": "motivo",
  "Detalle": "detalle",
  "Fecha baja": "fecha_baja",
  "Creado por": "creado_por",
  "Fecha creado": "fecha_creado",
};

export type SilverBaja = {
  diio: string;
  fechaBaja: string;
  motivo: string | null;
  detalle: string | null;
  tipoGanado: string | null;
  fechaNacimiento: string | null;
  estadoReproductivo: string | null;
  observaciones: string | null;
  creadoPor: string | null;
  fechaCreadoSistema: string | null;
};

export type ParsedBajaRow = {
  rowNumber: number;
  raw: Record<string, unknown>;
  silver: SilverBaja;
};

export type ParseBajasResult = {
  totalRows: number;
  validRows: ParsedBajaRow[];
  errors: { rowNumber: number; reason: string }[];
};

export async function parseBajasXlsx(
  buffer: Buffer
): Promise<ParseBajasResult> {
  const wb = new ExcelJS.Workbook();
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  await wb.xlsx.load(ab);

  const sheet = wb.worksheets[0];
  if (!sheet) return { totalRows: 0, validRows: [], errors: [] };

  const headers: (string | null)[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const label = String(cell.value ?? "").trim();
    headers[colNumber - 1] = HEADER_MAP[label] ?? null;
  });

  const validRows: ParsedBajaRow[] = [];
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

    const result = BajaRowSchema.safeParse(raw);
    if (!result.success) {
      errors.push({ rowNumber: r, reason: formatZodError(result.error) });
      continue;
    }

    const d = result.data;
    validRows.push({
      rowNumber: r,
      raw,
      silver: {
        diio: d.diio,
        fechaBaja: d.fecha_baja,
        motivo: d.motivo,
        detalle: d.detalle,
        tipoGanado: d.tipo_ganado ?? null,
        fechaNacimiento: d.fecha_nacimiento,
        estadoReproductivo: d.estado_reproductivo,
        observaciones: null, // no hay col observaciones en bajas
        creadoPor: d.creado_por,
        fechaCreadoSistema: d.fecha_creado,
      },
    });
  }

  return { totalRows: validRows.length + errors.length, validRows, errors };
}
