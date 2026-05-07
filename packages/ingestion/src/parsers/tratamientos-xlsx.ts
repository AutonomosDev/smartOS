import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import {
  TratamientoRowSchema,
  addDays,
  formatZodError,
  parseDiasInt,
  parseDiasNumeric,
  parseDosisMl,
  parseMedicamento,
  parseSerieVenc,
} from "./tratamientos-schema.js";

const HEADER_MAP: Record<string, string> = {
  "ID": "id_agroapp",
  "Diio": "diio",
  "Fundo": "fundo",
  "Tipo ganado": "tipo_ganado",
  "Estado reproductivo": "estado_reproductivo",
  "Fecha tratamiento": "fecha_tratamiento",
  "Diagnóstico": "diagnostico",
  "Observaciones": "observaciones",
  "Medicamento-Reg. SAG": "medicamento",
  "Serie-Venc.": "serie_venc",
  "Vía": "via",
  "Dosis": "dosis",
  "Repetir cada": "repetir_cada",
  "Repetir": "repetir_veces",
  "Inicio": "inicio",
  "Fin": "fin",
  "Resguardo leche": "resguardo_leche",
  "Resguardo carne": "resguardo_carne",
  "Liberación leche": "liberacion_leche_xlsx",
  "Liberación carne": "liberacion_carne_xlsx",
  "Creado por": "creado_por",
  "Fecha creado": "fecha_creado",
};

export type SilverTratamiento = {
  diio: string;
  fechaTratamiento: string;
  diagnostico: string | null;
  medicamentoNombre: string | null;
  medicamentoSag: string | null;
  medicamentoRaw: string | null;
  serie: string | null;
  vencimiento: string | null;
  via: string | null;
  dosisRaw: string | null;
  dosisMl: string | null;
  repetirCadaDias: string | null;
  repetirVeces: number | null;
  inicio: string | null;
  fin: string | null;
  resguardoLecheDias: number | null;
  resguardoCarneDias: number | null;
  liberacionLeche: string | null;
  liberacionCarne: string | null;
  observaciones: string | null;
  creadoPor: string | null;
  fechaCreadoSistema: string | null;
  contentHash: string;
};

export type Discrepancia = {
  rowNumber: number;
  diio: string;
  campo: "liberacion_leche" | "liberacion_carne";
  agroapp: string | null;
  calculado: string | null;
};

export type ParsedTratamientoRow = {
  rowNumber: number;
  raw: Record<string, unknown>;
  silver: SilverTratamiento;
};

export type ParseTratamientosResult = {
  totalRows: number;
  validRows: ParsedTratamientoRow[];
  errors: { rowNumber: number; reason: string }[];
  discrepancias: Discrepancia[];
};

function computeHash(parts: (string | number | null)[]): string {
  const s = parts.map((p) => (p ?? "")).join("|");
  return createHash("md5").update(s).digest("hex");
}

export async function parseTratamientosXlsx(
  buffer: Buffer
): Promise<ParseTratamientosResult> {
  const wb = new ExcelJS.Workbook();
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  await wb.xlsx.load(ab);

  const sheet = wb.worksheets[0];
  if (!sheet) {
    return { totalRows: 0, validRows: [], errors: [], discrepancias: [] };
  }

  const headers: (string | null)[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const label = String(cell.value ?? "").trim();
    headers[colNumber - 1] = HEADER_MAP[label] ?? null;
  });

  const validRows: ParsedTratamientoRow[] = [];
  const errors: { rowNumber: number; reason: string }[] = [];
  const discrepancias: Discrepancia[] = [];

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

    const result = TratamientoRowSchema.safeParse(raw);
    if (!result.success) {
      errors.push({ rowNumber: r, reason: formatZodError(result.error) });
      continue;
    }

    const data = result.data;

    // Parser dominio
    const med = parseMedicamento(data.medicamento);
    const sv = parseSerieVenc(data.serie_venc);
    const dosisMl = parseDosisMl(data.dosis);
    const repCada = parseDiasNumeric(data.repetir_cada);
    const resgLeche = parseDiasInt(data.resguardo_leche);
    const resgCarne = parseDiasInt(data.resguardo_carne);

    // Cálculo nuestro de liberaciones (fuente de verdad)
    const liberacionLeche =
      resgLeche != null ? addDays(data.fecha_tratamiento, resgLeche) : null;
    const liberacionCarne =
      resgCarne != null ? addDays(data.fecha_tratamiento, resgCarne) : null;

    // Detección de discrepancia con AgroApp
    if (
      data.liberacion_leche_xlsx != null &&
      liberacionLeche != null &&
      data.liberacion_leche_xlsx !== liberacionLeche
    ) {
      discrepancias.push({
        rowNumber: r,
        diio: data.diio,
        campo: "liberacion_leche",
        agroapp: data.liberacion_leche_xlsx,
        calculado: liberacionLeche,
      });
    }
    if (
      data.liberacion_carne_xlsx != null &&
      liberacionCarne != null &&
      data.liberacion_carne_xlsx !== liberacionCarne
    ) {
      discrepancias.push({
        rowNumber: r,
        diio: data.diio,
        campo: "liberacion_carne",
        agroapp: data.liberacion_carne_xlsx,
        calculado: liberacionCarne,
      });
    }

    const contentHash = computeHash([
      data.diio,
      data.fecha_tratamiento,
      med.nombre,
      med.sag,
      sv.serie,
      data.via,
      data.dosis,
      data.observaciones,
      data.creado_por,
      data.repetir_veces,
    ]);

    validRows.push({
      rowNumber: r,
      raw,
      silver: {
        diio: data.diio,
        fechaTratamiento: data.fecha_tratamiento,
        diagnostico: data.diagnostico,
        medicamentoNombre: med.nombre,
        medicamentoSag: med.sag,
        medicamentoRaw: med.raw,
        serie: sv.serie,
        vencimiento: sv.vencimiento,
        via: data.via,
        dosisRaw: data.dosis,
        dosisMl,
        repetirCadaDias: repCada,
        repetirVeces: data.repetir_veces,
        inicio: data.inicio,
        fin: data.fin,
        resguardoLecheDias: resgLeche,
        resguardoCarneDias: resgCarne,
        liberacionLeche,
        liberacionCarne,
        observaciones: data.observaciones,
        creadoPor: data.creado_por,
        fechaCreadoSistema: data.fecha_creado,
        contentHash,
      },
    });
  }

  return {
    totalRows: validRows.length + errors.length,
    validRows,
    errors,
    discrepancias,
  };
}
