/**
 * Tools de MUTATION (escritura).
 * Aplican las 7 reglas de .claude/rules/agent-actions.md
 *
 * Cada tool tiene 2 funciones:
 *   simulate(input)  → calcula efecto + warnings sin tocar DB
 *   execute(input)   → escribe DB de verdad
 *
 * El servicio agent-actions.ts orquesta el flujo:
 *   dry_run=true  → llama simulate
 *   dry_run=false → require user_confirmed → llama execute
 */
import { sql } from "drizzle-orm";
import { db, schema } from "@smartos/ingestion";

const PESAJES = schema.pesajes;
const PESAJES_BRONZE = schema.pesajesBronze;
const ANIMALES = schema.animales;
const BAJAS = schema.bajas;

// ──────────────────────────────────────────────
// Tipo común
// ──────────────────────────────────────────────
export type SimulateResult = {
  willDo: Record<string, unknown>;
  context: Record<string, unknown>;
  warnings: string[];
  sideEffects: string[];
};

export type ExecuteResult = {
  did: Record<string, unknown>;
  rowsAffected: number;
};

// ──────────────────────────────────────────────
// Tool 1: registrar_pesaje
// ──────────────────────────────────────────────

export type RegistrarPesajeInput = {
  diio: string;
  peso_kg: number;
  fecha: string; // YYYY-MM-DD
  observaciones?: string;
  creado_por?: string;
};

function validatePesajeInput(i: RegistrarPesajeInput): string[] {
  const errors: string[] = [];
  if (!/^\d{6,10}$/.test(String(i.diio))) errors.push("DIIO debe ser 6-10 dígitos");
  if (!Number.isFinite(i.peso_kg) || i.peso_kg <= 0 || i.peso_kg >= 2000) {
    errors.push("peso_kg fuera de rango (0, 2000)");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.fecha)) {
    errors.push("fecha debe ser YYYY-MM-DD");
  }
  return errors;
}

export async function simulateRegistrarPesaje(
  input: RegistrarPesajeInput
): Promise<SimulateResult> {
  const errors = validatePesajeInput(input);
  if (errors.length > 0) {
    return {
      willDo: input,
      context: {},
      warnings: errors,
      sideEffects: ["NINGUNO — validación falló"],
    };
  }

  // Buscar último pesaje del animal
  const last = await db.execute<{
    fecha_pesaje: string;
    peso_kg: string;
  }>(sql`
    SELECT fecha_pesaje::text, peso_kg::text FROM pesajes
    WHERE diio = ${input.diio}
    ORDER BY fecha_pesaje DESC LIMIT 1
  `);

  // Buscar info del animal
  const animal = await db.execute<{
    estado: string;
    tipo_ganado: string | null;
    proveedor: string | null;
  }>(sql`
    SELECT a.estado, a.tipo_ganado, c.proveedor
    FROM animales a
    LEFT JOIN v_proveedor_canonico c ON c.diio = a.diio
    WHERE a.diio = ${input.diio} LIMIT 1
  `);

  const warnings: string[] = [];
  const ctx: Record<string, unknown> = {};

  if (animal.rows.length === 0) {
    warnings.push(`DIIO ${input.diio} no existe en inventario`);
  } else {
    ctx.estado = animal.rows[0]!.estado;
    ctx.tipo_ganado = animal.rows[0]!.tipo_ganado;
    ctx.proveedor = animal.rows[0]!.proveedor;
    if (animal.rows[0]!.estado !== "Vivo") {
      warnings.push(`animal está en estado='${animal.rows[0]!.estado}', no 'Vivo'`);
    }
  }

  if (last.rows.length > 0) {
    const lastPeso = Number(last.rows[0]!.peso_kg);
    const lastFecha = last.rows[0]!.fecha_pesaje;
    const dt = new Date(input.fecha).getTime() - new Date(lastFecha).getTime();
    const dias = Math.max(1, dt / 86_400_000);
    const gdpSim = (input.peso_kg - lastPeso) / dias;
    ctx.ultimo_pesaje = { fecha: lastFecha, peso_kg: lastPeso };
    ctx.gdp_simulado = Math.round(gdpSim * 1000) / 1000;
    ctx.dias_desde_ultimo = Math.round(dias);

    if (gdpSim > 2.5) {
      warnings.push(
        `GDP simulado ${gdpSim.toFixed(2)} kg/d es biológicamente imposible (>2.5)`
      );
    }
    if (gdpSim < -0.5) {
      warnings.push(
        `Pérdida de peso anormal (${gdpSim.toFixed(2)} kg/d). Animal enfermo?`
      );
    }
    if (input.fecha === lastFecha) {
      warnings.push(
        `Ya hay un pesaje de este animal en la misma fecha. Reemplazará? UNIQUE (diio, fecha) lo rechazará.`
      );
    }
    if (new Date(input.fecha) < new Date(lastFecha)) {
      warnings.push(`fecha es anterior al último pesaje (${lastFecha})`);
    }
  } else {
    ctx.ultimo_pesaje = null;
    warnings.push("primer pesaje del animal — sin baseline para comparar");
  }

  const sideEffects = [
    "INSERT en pesajes (Silver)",
    "INSERT en pesajes_bronze (audit raw)",
    "v_estancia_animal recalcula automáticamente",
    "v_zona_dinero refleja el nuevo peso",
    "v_reclamables recalcula GDP",
  ];

  return {
    willDo: {
      diio: input.diio,
      peso_kg: input.peso_kg,
      fecha_pesaje: input.fecha,
      observaciones: input.observaciones ?? null,
      creado_por: input.creado_por ?? "agent",
    },
    context: ctx,
    warnings,
    sideEffects,
  };
}

export async function executeRegistrarPesaje(
  input: RegistrarPesajeInput
): Promise<ExecuteResult> {
  const errors = validatePesajeInput(input);
  if (errors.length > 0) {
    throw new Error(`validation_failed: ${errors.join("; ")}`);
  }

  return await db.transaction(async (tx) => {
    // Bronze (audit raw)
    await tx.insert(PESAJES_BRONZE).values({
      sourceFile: "agent_action",
      rowNumber: 0,
      raw: { ...input, source: "agent_action" },
    });

    // Silver con onConflictDoNothing por (diio, fecha)
    const inserted = await tx
      .insert(PESAJES)
      .values({
        diio: input.diio,
        fechaPesaje: input.fecha,
        pesoKg: String(input.peso_kg),
        observaciones: input.observaciones ?? null,
        creadoPor: input.creado_por ?? "agent",
        sourceFile: "agent_action",
      })
      .onConflictDoNothing({
        target: [PESAJES.diio, PESAJES.fechaPesaje],
      })
      .returning({ id: PESAJES.id });

    if (inserted.length === 0) {
      throw new Error(
        `pesaje_duplicado: ya existe pesaje para ${input.diio} en ${input.fecha}`
      );
    }

    return {
      did: { ...input, id: inserted[0]!.id },
      rowsAffected: inserted.length,
    };
  });
}

// ──────────────────────────────────────────────
// Tool 2: registrar_baja
// ──────────────────────────────────────────────

export type RegistrarBajaInput = {
  diio: string;
  motivo: string;
  detalle?: string;
  fecha: string; // YYYY-MM-DD
  creado_por?: string;
};

const MOTIVOS_VALIDOS = ["Muerte", "Accidente", "Faena", "Venta", "Pérdida"];

function validateBajaInput(i: RegistrarBajaInput): string[] {
  const errors: string[] = [];
  if (!/^\d{6,10}$/.test(String(i.diio))) errors.push("DIIO debe ser 6-10 dígitos");
  if (!MOTIVOS_VALIDOS.includes(i.motivo)) {
    errors.push(`motivo inválido (${MOTIVOS_VALIDOS.join(", ")})`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.fecha)) {
    errors.push("fecha debe ser YYYY-MM-DD");
  }
  return errors;
}

export async function simulateRegistrarBaja(
  input: RegistrarBajaInput
): Promise<SimulateResult> {
  const errors = validateBajaInput(input);
  if (errors.length > 0) {
    return {
      willDo: input,
      context: {},
      warnings: errors,
      sideEffects: ["NINGUNO — validación falló"],
    };
  }

  const animal = await db.execute<{
    estado: string;
    tipo_ganado: string | null;
    fecha_ingreso: string | null;
    ultimo_peso_kg: string | null;
  }>(sql`
    SELECT estado, tipo_ganado, fecha_ingreso::text, ultimo_peso_kg::text
    FROM animales WHERE diio = ${input.diio} LIMIT 1
  `);

  const yaBaja = await db.execute<{ id: string }>(sql`
    SELECT id::text FROM bajas WHERE diio = ${input.diio} LIMIT 1
  `);

  const resguardo = await db.execute<{ liberacion_carne: string }>(sql`
    SELECT MAX(liberacion_carne)::text AS liberacion_carne
    FROM tratamientos
    WHERE diio = ${input.diio} AND liberacion_carne > CURRENT_DATE
  `);

  const warnings: string[] = [];
  const ctx: Record<string, unknown> = {};

  if (animal.rows.length === 0) {
    warnings.push(`DIIO ${input.diio} no existe en inventario`);
  } else {
    ctx.estado_actual = animal.rows[0]!.estado;
    ctx.tipo_ganado = animal.rows[0]!.tipo_ganado;
    ctx.peso_actual = animal.rows[0]!.ultimo_peso_kg;
    if (animal.rows[0]!.estado !== "Vivo") {
      warnings.push(
        `animal ya está en estado='${animal.rows[0]!.estado}'. Doble baja sospechosa.`
      );
    }
  }

  if (yaBaja.rows.length > 0) {
    warnings.push("animal ya tiene un registro de baja previo (UNIQUE diio rechazará)");
  }

  if (input.motivo === "Faena" && resguardo.rows[0]?.liberacion_carne) {
    warnings.push(
      `🚨 RESGUARDO SAG ACTIVO: animal tiene tratamiento con liberación carne ${resguardo.rows[0].liberacion_carne}. Faenar antes = VIOLACIÓN SAG.`
    );
    ctx.liberacion_carne = resguardo.rows[0].liberacion_carne;
  }

  const sideEffects = [
    "INSERT en bajas",
    "v_estancia_animal removerá el animal",
    "v_dashboard_mollendo restará animales activos",
    "queries históricas seguirán mostrando el animal",
  ];

  return {
    willDo: {
      diio: input.diio,
      fecha_baja: input.fecha,
      motivo: input.motivo,
      detalle: input.detalle ?? null,
      creado_por: input.creado_por ?? "agent",
    },
    context: ctx,
    warnings,
    sideEffects,
  };
}

export async function executeRegistrarBaja(
  input: RegistrarBajaInput
): Promise<ExecuteResult> {
  const errors = validateBajaInput(input);
  if (errors.length > 0) {
    throw new Error(`validation_failed: ${errors.join("; ")}`);
  }

  const inserted = await db
    .insert(BAJAS)
    .values({
      diio: input.diio,
      fechaBaja: input.fecha,
      motivo: input.motivo,
      detalle: input.detalle ?? null,
      creadoPor: input.creado_por ?? "agent",
      sourceFile: "agent_action",
    })
    .onConflictDoNothing({ target: BAJAS.diio })
    .returning({ id: BAJAS.id });

  if (inserted.length === 0) {
    throw new Error(`baja_duplicada: animal ${input.diio} ya tiene baja registrada`);
  }

  // Actualizar estado del animal en inventario
  await db
    .update(ANIMALES)
    .set({ estado: "baja" })
    .where(sql`diio = ${input.diio}`);

  return {
    did: { ...input, id: inserted[0]!.id },
    rowsAffected: inserted.length,
  };
}

// ──────────────────────────────────────────────
// Catálogo de tools de escritura
// ──────────────────────────────────────────────

type ToolHandler = {
  simulate: (input: any) => Promise<SimulateResult>;
  execute: (input: any) => Promise<ExecuteResult>;
  reversibility: "soft" | "hard";
  requiredRole: string;
};

export const WRITE_TOOLS: Record<string, ToolHandler> = {
  registrar_pesaje: {
    simulate: simulateRegistrarPesaje,
    execute: executeRegistrarPesaje,
    reversibility: "soft", // se puede UPDATE/DELETE el pesaje si hay error
    requiredRole: "operador",
  },
  registrar_baja: {
    simulate: simulateRegistrarBaja,
    execute: executeRegistrarBaja,
    reversibility: "hard", // baja física, no se deshace
    requiredRole: "admin_org",
  },
};
