/**
 * Adapter: tool_result (smartOS ontology) → artifact_block (smartcow UI).
 *
 * smartcow chat-panel.tsx espera eventos SSE con artifact_block que
 * contienen un payload SSEArtifact con type table/kpi/alerts/chart/dashboard.
 *
 * Este adapter toma el resultado de cada tool y, si tiene sentido,
 * devuelve el artifact correspondiente para que la UI lo renderice
 * en el panel derecho.
 */

export type ArtifactRow = { label: string; value: string; color?: "ok" };
export type ArtifactKpi = { val: string; lbl: string; color?: string };
export type ArtifactItem = { text: string };

export type Artifact = {
  type: "table" | "kpi" | "alerts" | "chart" | "dashboard";
  title?: string;
  rows?: ArtifactRow[];
  kpis?: ArtifactKpi[];
  items?: ArtifactItem[];
};

const fmt = (n: number) => n.toLocaleString("es-CL");

// ──────────────────────────────────────────────────────────────────
// Mappers por tool
// ──────────────────────────────────────────────────────────────────

function mapDashboard(result: unknown): Artifact | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, any>;
  if (!r.inventario || !r.alarmas) return null;

  return {
    type: "kpi",
    title: "Dashboard Mollendo",
    kpis: [
      { val: fmt(r.inventario.animalesActivos ?? 0), lbl: "animales activos" },
      { val: `${fmt(r.inventario.kgTotalesActivos ?? 0)} kg`, lbl: "peso total" },
      {
        val: r.gdp?.avgConfiable ? `${r.gdp.avgConfiable} kg/d` : "—",
        lbl: "GDP confiable",
      },
      {
        val: fmt(r.zonaVenta?.animales ?? 0),
        lbl: "zona venta",
        color: "ok",
      },
      {
        val: `USD ${fmt(r.zonaVenta?.valorEstimadoUsd ?? 0)}`,
        lbl: "valor estimado",
        color: "ok",
      },
      {
        val: fmt(r.alarmas?.reclamables ?? 0),
        lbl: "reclamables",
        color: r.alarmas?.reclamables > 0 ? "warn" : undefined,
      },
    ],
  };
}

function mapProveedores(result: unknown): Artifact | null {
  if (!Array.isArray(result)) return null;
  const items = result as Array<Record<string, any>>;

  return {
    type: "table",
    title: "Ranking proveedores",
    rows: items.slice(0, 10).map((p) => ({
      label: String(p.nombre ?? ""),
      value:
        p.gdpAvg != null
          ? `${p.animalesEvaluables} anim · GDP ${p.gdpAvg} · ${p.pctReclamable ?? 0}% reclam`
          : `${p.animalesActivos} anim · sin GDP confiable (cohorte nueva)`,
      color: p.gdpAvg != null && p.gdpAvg >= 1.5 ? ("ok" as const) : undefined,
    })),
  };
}

function mapAnimales(result: unknown): Artifact | null {
  if (!Array.isArray(result)) return null;
  const items = result as Array<Record<string, any>>;
  if (items.length === 0) return null;

  return {
    type: "table",
    title: `Animales (${items.length})`,
    rows: items.slice(0, 20).map((a) => ({
      label: `DIIO ${a.diio}`,
      value: `${a.pesoActualKg ?? "—"} kg · ${a.diasEstabulado ?? "—"}d · ${
        a.proveedor ?? "sin prov"
      }${a.esReclamable ? " ⚠" : ""}`,
      color: a.esVendible ? ("ok" as const) : undefined,
    })),
  };
}

function mapAnimal(result: unknown): Artifact | null {
  if (!result || typeof result !== "object") return null;
  const a = result as Record<string, any>;
  if (a.error || !a.diio) return null;

  return {
    type: "kpi",
    title: `Animal ${a.diio}`,
    kpis: [
      {
        val: a.pesoActualKg != null ? `${a.pesoActualKg} kg` : "—",
        lbl: "peso actual",
      },
      {
        val: a.diasEstabulado != null ? `${a.diasEstabulado}d` : "—",
        lbl: "estadía",
      },
      {
        val: a.gdpConfiable != null ? `${a.gdpConfiable} kg/d` : "n/a",
        lbl: "GDP",
        color:
          a.gdpConfiable != null && a.gdpConfiable < 1.2 ? "warn" : undefined,
      },
      { val: a.proveedor ?? "—", lbl: "proveedor" },
      {
        val: a.esVendible ? "SÍ" : "NO",
        lbl: "vendible",
        color: a.esVendible ? "ok" : undefined,
      },
      {
        val: a.esReclamable ? "SÍ" : "NO",
        lbl: "reclamable",
        color: a.esReclamable ? "warn" : undefined,
      },
    ],
  };
}

function mapAlarmasResguardo(result: unknown): Artifact | null {
  if (!Array.isArray(result)) return null;
  const items = result as Array<Record<string, any>>;
  if (items.length === 0) {
    return {
      type: "alerts",
      title: "Resguardo sanitario",
      items: [{ text: "✅ No hay animales en resguardo activo." }],
    };
  }

  return {
    type: "alerts",
    title: `Resguardo carne (${items.length})`,
    items: items.slice(0, 20).map((al) => ({
      text: `DIIO ${al.diio} — ${al.medicamentoNombre ?? "med?"} · libera ${al.liberacionCarne} (${al.diasFaltantes}d)`,
    })),
  };
}

function mapVentas(result: unknown): Artifact | null {
  if (!Array.isArray(result)) return null;
  const items = result as Array<Record<string, any>>;
  if (items.length === 0) return null;

  return {
    type: "table",
    title: `Ventas (${items.length})`,
    rows: items.slice(0, 15).map((v) => ({
      label: `Venta ${v.numeroVenta} · ${v.fechaVenta}`,
      value: `${v.cantidadAnimales ?? "?"} anim · ${
        v.pesoTotalKg != null ? fmt(v.pesoTotalKg) + " kg" : "—"
      }`,
      color: v.estado === "Completo" ? ("ok" as const) : undefined,
    })),
  };
}

function mapPesajes(result: unknown): Artifact | null {
  if (!Array.isArray(result)) return null;
  const items = result as Array<Record<string, any>>;
  if (items.length === 0) return null;

  return {
    type: "table",
    title: `Pesajes (${items.length})`,
    rows: items.map((p) => ({
      label: String(p.fechaPesaje ?? ""),
      value: `${p.pesoKg ?? "—"} kg${p.observaciones ? ` · ${p.observaciones}` : ""}`,
    })),
  };
}

// ──────────────────────────────────────────────────────────────────
// Dispatcher
// ──────────────────────────────────────────────────────────────────

export function mapToolResultToArtifact(
  toolName: string,
  result: unknown
): Artifact | null {
  switch (toolName) {
    case "get_dashboard":
      return mapDashboard(result);
    case "list_proveedores":
      return mapProveedores(result);
    case "get_proveedor":
      return mapProveedores([result]);
    case "list_animales":
      return mapAnimales(result);
    case "get_animal":
      return mapAnimal(result);
    case "list_alarmas_resguardo":
      return mapAlarmasResguardo(result);
    case "list_ventas":
      return mapVentas(result);
    case "get_pesajes_animal":
      return mapPesajes(result);
    default:
      return null;
  }
}
