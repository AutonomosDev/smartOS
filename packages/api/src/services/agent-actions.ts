import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { agentActions, db } from "@smartos/ingestion";
import { WRITE_TOOLS, type SimulateResult } from "../agent/tools-write.js";

const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  operador: 1,
  veterinario: 2,
  admin_fundo: 3,
  admin_org: 4,
  superadmin: 5,
};

function roleAtLeast(actual: string | undefined, required: string): boolean {
  const a = ROLE_RANK[actual ?? "viewer"] ?? 0;
  const r = ROLE_RANK[required] ?? 99;
  return a >= r;
}

export type ExecuteWriteToolInput = {
  toolName: string;
  input: Record<string, unknown>;
  dryRun?: boolean;
  idempotencyKey?: string;
  sesionId?: string;
  userConfirmed?: boolean;
  callerRole?: string;
  doubleConfirm?: boolean;
};

export type ExecuteWriteToolResult =
  | {
      status: "success";
      mode: "dry_run" | "executed";
      actionId: string;
      idempotencyKey: string;
      toolName: string;
      simulation?: SimulateResult;
      result?: unknown;
    }
  | {
      status: "needs_confirmation";
      mode: "dry_run";
      reason: string;
      actionId: string;
      idempotencyKey: string;
      simulation: SimulateResult;
    }
  | {
      status: "error";
      mode: "dry_run" | "executed";
      actionId: string;
      idempotencyKey: string;
      detail: string;
    };

export async function executeWriteTool(
  args: ExecuteWriteToolInput
): Promise<ExecuteWriteToolResult> {
  const tool = WRITE_TOOLS[args.toolName];
  if (!tool) {
    throw new Error(`unknown_tool: ${args.toolName}`);
  }

  // Regla 6 — Permission check
  if (!roleAtLeast(args.callerRole, tool.requiredRole)) {
    throw new Error(
      `forbidden: tool ${args.toolName} requires role ${tool.requiredRole}, caller has ${args.callerRole ?? "none"}`
    );
  }

  // Regla 1 — dry_run por default
  const dryRun = args.dryRun !== false;

  // Regla 3 — idempotency key
  const idempotencyKey = args.idempotencyKey ?? randomUUID();

  // Si ya existe acción con esta key → devolver resultado anterior
  const existing = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existing[0]) {
    const prev = existing[0];
    if (prev.status === "success") {
      return {
        status: "success",
        mode: prev.dryRun ? "dry_run" : "executed",
        actionId: prev.id,
        idempotencyKey,
        toolName: prev.toolName,
        simulation: prev.dryRun ? (prev.result as SimulateResult) : undefined,
        result: !prev.dryRun ? prev.result : undefined,
      };
    }
    if (prev.status === "error") {
      return {
        status: "error",
        mode: prev.dryRun ? "dry_run" : "executed",
        actionId: prev.id,
        idempotencyKey,
        detail: prev.errorDetail ?? "previous_error",
      };
    }
  }

  // Regla 5 — hard requires double confirm
  if (!dryRun && tool.reversibility === "hard" && !args.doubleConfirm) {
    // Insertar acción pendiente para audit, pero no ejecutar
    const [pending] = await db
      .insert(agentActions)
      .values({
        sesionId: args.sesionId ?? null,
        toolName: args.toolName,
        input: args.input,
        dryRun: true,
        userConfirmed: !!args.userConfirmed,
        idempotencyKey,
        status: "pending",
        requiredRole: tool.requiredRole,
        callerRole: args.callerRole ?? null,
      })
      .returning({ id: agentActions.id });

    const simulation = await tool.simulate(args.input);
    return {
      status: "needs_confirmation",
      mode: "dry_run",
      reason: "tool_es_hard_reversibility — requiere doubleConfirm=true",
      actionId: pending!.id,
      idempotencyKey,
      simulation,
    };
  }

  // Regla 2 — confirmación human-in-the-loop
  if (!dryRun && !args.userConfirmed) {
    const [pending] = await db
      .insert(agentActions)
      .values({
        sesionId: args.sesionId ?? null,
        toolName: args.toolName,
        input: args.input,
        dryRun: true,
        userConfirmed: false,
        idempotencyKey,
        status: "pending",
        requiredRole: tool.requiredRole,
        callerRole: args.callerRole ?? null,
      })
      .returning({ id: agentActions.id });

    const simulation = await tool.simulate(args.input);
    return {
      status: "needs_confirmation",
      mode: "dry_run",
      reason: "userConfirmed=true es obligatorio para ejecutar",
      actionId: pending!.id,
      idempotencyKey,
      simulation,
    };
  }

  // Insertar acción (pending) para audit
  const [action] = await db
    .insert(agentActions)
    .values({
      sesionId: args.sesionId ?? null,
      toolName: args.toolName,
      input: args.input,
      dryRun,
      userConfirmed: !!args.userConfirmed,
      idempotencyKey,
      status: "pending",
      requiredRole: tool.requiredRole,
      callerRole: args.callerRole ?? null,
    })
    .returning({ id: agentActions.id });

  const actionId = action!.id;

  try {
    if (dryRun) {
      const simulation = await tool.simulate(args.input);
      // Regla 4 — audit log de la simulación
      await db
        .update(agentActions)
        .set({
          status: "success",
          result: simulation as unknown as Record<string, unknown>,
          executedAt: new Date(),
        })
        .where(eq(agentActions.id, actionId));

      return {
        status: "success",
        mode: "dry_run",
        actionId,
        idempotencyKey,
        toolName: args.toolName,
        simulation,
      };
    } else {
      const result = await tool.execute(args.input);
      await db
        .update(agentActions)
        .set({
          status: "success",
          result: result as unknown as Record<string, unknown>,
          executedAt: new Date(),
        })
        .where(eq(agentActions.id, actionId));

      return {
        status: "success",
        mode: "executed",
        actionId,
        idempotencyKey,
        toolName: args.toolName,
        result,
      };
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown_error";
    await db
      .update(agentActions)
      .set({
        status: "error",
        errorDetail: detail,
        executedAt: new Date(),
      })
      .where(eq(agentActions.id, actionId));

    return {
      status: "error",
      mode: dryRun ? "dry_run" : "executed",
      actionId,
      idempotencyKey,
      detail,
    };
  }
}
