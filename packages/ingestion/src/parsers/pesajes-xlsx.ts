import ExcelJS from "exceljs";
import {
  PesajeRowSchema,
  formatZodError,
  parseObservacion,
} from "./pesajes-schema.js";

const HEADER_MAP: Record<string, string> = {
  "Diio": "diio",
  "Fundo": "fundo",
  "Tipo ganado": "tipo_ganado",
  "Estado reproductivo": "estado_reproductivo",
  "Edad (meses)": "edad_meses",
  "Peso": "peso",
  "Observaciones": "observaciones",
  "Creado por": "creado_por",
  "Fecha creado": "fecha_creado",
};

export type SilverPesaje = {
  diio: string;
  fechaPesaje: string;
  pesoKg: string;
  edadMeses: string | null;
  tipoGanado: string | null;
  estadoReproductivo: string | null;
  alaGalpon: string | null;
  corral: string | null;
  observaciones: string | null;
  creadoPor: string | null;
};

export type ParsedPesajeRow = {
  rowNumber: number;
  raw: Record<string, unknown>;
  silver: SilverPesaje;
};

export type Alarm = {
  rowNumbers: number[];
  diio: string;
  fechaPesaje: string;
  count: number;
  reason: string;
};

export type ParsePesajesResult = {
  totalRows: number;
  validRows: ParsedPesajeRow[];
  errors: { rowNumber: number; reason: string }[];
  alarms: Alarm[];
};

export async function parsePesajesXlsx(
  buffer: Buffer
): Promise<ParsePesajesResult> {
  const wb = new ExcelJS.Workbook();
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  await wb.xlsx.load(ab);

  const sheet = wb.worksheets[0];
  if (!sheet) {
    return { totalRows: 0, validRows: [], errors: [], alarms: [] };
  }

  const headers: (string | null)[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const label = String(cell.value ?? "").trim();
    headers[colNumber - 1] = HEADER_MAP[label] ?? null;
  });

  const validRows: ParsedPesajeRow[] = [];
  const errors: { rowNumber: number; reason: string }[] = [];

  // Buffer para detectar duplicados intra-archivo (mismo DIIO + fecha)
  const seenKeys = new Map<string, number[]>(); // "diio|fecha" -> [rowNumbers]
  const validByKey = new Map<string, ParsedPesajeRow>();

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

    const result = PesajeRowSchema.safeParse(raw);
    if (!result.success) {
      errors.push({ rowNumber: r, reason: formatZodError(result.error) });
      continue;
    }

    const data = result.data;
    const ubic = parseObservacion(data.observaciones);
    const key = `${data.diio}|${data.fecha_creado}`;

    const parsedRow: ParsedPesajeRow = {
      rowNumber: r,
      raw,
      silver: {
        diio: data.diio,
        fechaPesaje: data.fecha_creado,
        pesoKg: data.peso,
        edadMeses: data.edad_meses,
        tipoGanado: data.tipo_ganado ?? null,
        estadoReproductivo: data.estado_reproductivo,
        alaGalpon: ubic.alaGalpon,
        corral: ubic.corral,
        observaciones: ubic.observacionesLibre,
        creadoPor: data.creado_por,
      },
    };

    if (seenKeys.has(key)) {
      seenKeys.get(key)!.push(r);
    } else {
      seenKeys.set(key, [r]);
      validByKey.set(key, parsedRow);
    }
  }

  // Promote alarmas: keys con >1 rownumber → ninguna entra a Silver
  const alarms: Alarm[] = [];
  for (const [key, rows] of seenKeys) {
    if (rows.length > 1) {
      const [diio, fecha] = key.split("|");
      alarms.push({
        rowNumbers: rows,
        diio: diio ?? "",
        fechaPesaje: fecha ?? "",
        count: rows.length,
        reason: `${rows.length} pesajes mismo día (rows ${rows.join(", ")})`,
      });
      validByKey.delete(key);
    }
  }

  for (const r of validByKey.values()) validRows.push(r);

  return {
    totalRows: validRows.length + errors.length + alarms.length,
    validRows,
    errors,
    alarms,
  };
}
