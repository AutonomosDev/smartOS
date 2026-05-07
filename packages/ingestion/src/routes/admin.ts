import { Hono } from "hono";
import { buildConsistenciaReport } from "../services/consistencia.js";
import {
  getAlarmasResguardoCarne,
  getDashboardCabecera,
  getKpisMensuales,
  getRankingProveedor,
  getZonaVenta,
  type AnimalZonaVenta,
} from "../services/dashboard.js";

export const adminRouter = new Hono();

adminRouter.get("/consistencia", async (c) => {
  try {
    const report = await buildConsistenciaReport();
    return c.json(report, 200);
  } catch (err) {
    console.error("[consistencia_failed]", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return c.json({ error: "consistencia_failed", detail: message }, 500);
  }
});

adminRouter.get("/dashboard", async (c) => {
  try {
    return c.json(await getDashboardCabecera(), 200);
  } catch (err) {
    console.error("[dashboard_failed]", err);
    return c.json(
      { error: "dashboard_failed", detail: err instanceof Error ? err.message : "x" },
      500
    );
  }
});

adminRouter.get("/dashboard/proveedores", async (c) => {
  try {
    return c.json(await getRankingProveedor(), 200);
  } catch (err) {
    return c.json(
      { error: "ranking_failed", detail: err instanceof Error ? err.message : "x" },
      500
    );
  }
});

adminRouter.get("/dashboard/zona-venta", async (c) => {
  const prioridad = c.req.query("prioridad") as
    | AnimalZonaVenta["prioridad"]
    | undefined;
  try {
    return c.json(await getZonaVenta(prioridad), 200);
  } catch (err) {
    return c.json(
      { error: "zona_venta_failed", detail: err instanceof Error ? err.message : "x" },
      500
    );
  }
});

adminRouter.get("/dashboard/alarmas-resguardo", async (c) => {
  try {
    return c.json(await getAlarmasResguardoCarne(), 200);
  } catch (err) {
    return c.json(
      { error: "alarmas_failed", detail: err instanceof Error ? err.message : "x" },
      500
    );
  }
});

adminRouter.get("/dashboard/kpis-mensuales", async (c) => {
  try {
    return c.json(await getKpisMensuales(), 200);
  } catch (err) {
    return c.json(
      { error: "kpis_failed", detail: err instanceof Error ? err.message : "x" },
      500
    );
  }
});
