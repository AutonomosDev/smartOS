import { describe, expect, it } from "vitest";
import { mapToolResultToArtifact } from "../agent/artifact-mapper.js";

describe("artifact-mapper — adapter smartOS → smartcow UI", () => {
  describe("get_dashboard → kpi", () => {
    it("mapea cabecera ejecutiva en KPIs", () => {
      const r = mapToolResultToArtifact("get_dashboard", {
        inventario: { animalesActivos: 830, kgTotalesActivos: 385739, pesoAvgActivos: 464.7 },
        gdp: { avgConfiable: 1.545, animalesEvaluables: 341 },
        zonaVenta: { animales: 487, valorEstimadoUsd: 368067 },
        alarmas: { resguardoCarne: 0, reclamables: 38, sinPesar60d: 3, edadImposible: 142 },
        historico: { ventasTotal: 145, bajasTotal: 11, tratamientosTotal: 69, pctCojera: 73.9 },
      });
      expect(r).not.toBeNull();
      expect(r!.type).toBe("kpi");
      expect(r!.title).toBe("Dashboard Mollendo");
      expect(r!.kpis!.length).toBe(6);
      expect(r!.kpis![0]!.lbl).toBe("animales activos");
      expect(r!.kpis![5]!.color).toBe("warn"); // reclamables > 0
    });

    it("retorna null si data inválida", () => {
      expect(mapToolResultToArtifact("get_dashboard", null)).toBeNull();
      expect(mapToolResultToArtifact("get_dashboard", "string")).toBeNull();
      expect(mapToolResultToArtifact("get_dashboard", {})).toBeNull();
    });
  });

  describe("list_proveedores → table", () => {
    it("mapea ranking de proveedores", () => {
      const r = mapToolResultToArtifact("list_proveedores", [
        { nombre: "Santa Isabel", animalesActivos: 230, animalesEvaluables: 230, gdpAvg: 1.592, pctReclamable: 10 },
        { nombre: "Lingues", animalesActivos: 54, animalesEvaluables: 54, gdpAvg: 1.441, pctReclamable: 16.7 },
        { nombre: "Santa Alejandra", animalesActivos: 113, animalesEvaluables: 0, gdpAvg: null },
      ]);
      expect(r).not.toBeNull();
      expect(r!.type).toBe("table");
      expect(r!.rows!.length).toBe(3);
      expect(r!.rows![0]!.label).toBe("Santa Isabel");
      expect(r!.rows![0]!.color).toBe("ok"); // GDP >= 1.5
      expect(r!.rows![2]!.value).toContain("sin GDP confiable");
    });
  });

  describe("get_animal → kpi (caso crítico)", () => {
    it("mapea animal reclamable con warnings", () => {
      const r = mapToolResultToArtifact("get_animal", {
        diio: "26206180",
        proveedor: "Santa Isabel",
        pesoActualKg: 330,
        diasEstabulado: 72,
        gdpConfiable: -0.667,
        esVendible: false,
        esReclamable: true,
      });
      expect(r).not.toBeNull();
      expect(r!.type).toBe("kpi");
      expect(r!.title).toBe("Animal 26206180");
      const gdpKpi = r!.kpis!.find((k) => k.lbl === "GDP");
      expect(gdpKpi!.color).toBe("warn");
      const reclKpi = r!.kpis!.find((k) => k.lbl === "reclamable");
      expect(reclKpi!.val).toBe("SÍ");
    });

    it("retorna null si error", () => {
      expect(mapToolResultToArtifact("get_animal", { error: "not_found" })).toBeNull();
    });
  });

  describe("list_alarmas_resguardo → alerts", () => {
    it("array vacío → mensaje OK", () => {
      const r = mapToolResultToArtifact("list_alarmas_resguardo", []);
      expect(r!.type).toBe("alerts");
      expect(r!.items![0]!.text).toContain("✅");
    });

    it("alarmas activas → items detallados", () => {
      const r = mapToolResultToArtifact("list_alarmas_resguardo", [
        { diio: "X1", medicamentoNombre: "Tylan 200", liberacionCarne: "2026-06-01", diasFaltantes: 14 },
        { diio: "X2", medicamentoNombre: "Dexabiopen", liberacionCarne: "2026-06-15", diasFaltantes: 28 },
      ]);
      expect(r!.items!.length).toBe(2);
      expect(r!.title).toContain("(2)");
    });
  });

  describe("list_animales → table", () => {
    it("lista con flag reclamable", () => {
      const r = mapToolResultToArtifact("list_animales", [
        { diio: "1", pesoActualKg: 532, diasEstabulado: 100, proveedor: "Sta Isabel", esVendible: true, esReclamable: false },
        { diio: "2", pesoActualKg: 410, diasEstabulado: 80, proveedor: "Lingues", esVendible: false, esReclamable: true },
      ]);
      expect(r!.type).toBe("table");
      expect(r!.rows![0]!.color).toBe("ok");
      expect(r!.rows![1]!.value).toContain("⚠");
    });
  });

  describe("list_ventas → table", () => {
    it("mapea ventas históricas", () => {
      const r = mapToolResultToArtifact("list_ventas", [
        { numeroVenta: 7966, fechaVenta: "2026-04-07", cantidadAnimales: 45, pesoTotalKg: 23466, estado: "Completo" },
      ]);
      expect(r!.type).toBe("table");
      expect(r!.rows![0]!.label).toContain("7966");
      expect(r!.rows![0]!.color).toBe("ok");
    });
  });

  describe("get_pesajes_animal → table", () => {
    it("mapea historial de pesajes", () => {
      const r = mapToolResultToArtifact("get_pesajes_animal", [
        { fechaPesaje: "2026-01-20", pesoKg: "378.00" },
        { fechaPesaje: "2026-04-02", pesoKg: "330.00", observaciones: "PESAJE DESDE VENTA" },
      ]);
      expect(r!.type).toBe("table");
      expect(r!.rows!.length).toBe(2);
      expect(r!.rows![1]!.value).toContain("PESAJE DESDE VENTA");
    });
  });

  describe("Tool desconocida", () => {
    it("retorna null para tool sin mapper", () => {
      expect(mapToolResultToArtifact("tool_random", {})).toBeNull();
    });
  });
});
