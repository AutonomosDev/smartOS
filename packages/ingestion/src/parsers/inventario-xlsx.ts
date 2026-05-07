import ExcelJS from "exceljs";

/**
 * Mapeo de header literal del xlsx → key normalizada.
 * Si AgroApp cambia un header, sólo se ajusta acá.
 */
const HEADER_MAP: Record<string, string> = {
  "Diio": "diio",
  "Inventario": "inventario",
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

function toIsoDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toNumeric(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function toInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

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

    const diio = toString(raw["diio"]);
    const estado = toString(raw["inventario"]);

    if (!diio) {
      errors.push({ rowNumber: r, reason: "DIIO vacío" });
      continue;
    }
    if (!estado) {
      errors.push({ rowNumber: r, reason: "Estado (Inventario) vacío" });
      continue;
    }

    validRows.push({
      rowNumber: r,
      raw,
      silver: {
        diio,
        estado,
        tipoGanado: toString(raw["tipo_ganado"]),
        fechaNacimiento: toIsoDate(raw["fecha_nacimiento"]),
        estadoReproductivo: toString(raw["estado_reproductivo"]),
        estadoLeche: toString(raw["estado_leche"]),
        ultimoParto: toIsoDate(raw["ultimo_parto"]),
        ultimaInseminacion: toIsoDate(raw["ultima_inseminacion"]),
        totalIa: toInt(raw["total_ia"]),
        diasEnLeche: toInt(raw["dias_en_leche"]),
        diioMadre: toString(raw["diio_madre"]),
        padre: toString(raw["padre"]),
        origen: toString(raw["origen"]),
        fechaIngreso: toIsoDate(raw["fecha_creado"]),
        ultimoPesoKg: toNumeric(raw["peso"]),
        ultimoPesoAt: toIsoDate(raw["fecha_pesaje"]),
        observaciones: toString(raw["observaciones"]),
      },
    });
  }

  return {
    totalRows: validRows.length + errors.length,
    validRows,
    errors,
  };
}
