import { describe, expect, it } from "vitest";
import {
  getDashboardCabecera,
  listAlarmasResguardoCarne,
} from "../ontology/alarma.js";
import {
  getAnimal,
  getPesajesAnimal,
  listAnimalesActivos,
} from "../ontology/animal.js";
import { getProveedor, listProveedores } from "../ontology/proveedor.js";
import { listVentas } from "../ontology/venta.js";

/**
 * Tests de regresión sobre la ontología.
 * Requiere postgres local con data Mollendo cargada.
 *
 * NO usan LLM. Validan que las funciones devuelven
 * estructuras correctas con valores esperados.
 */

describe("Dashboard cabecera", () => {
  it("devuelve estructura completa con valores válidos", async () => {
    const d = await getDashboardCabecera();
    expect(d.fechaReporte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.inventario.animalesActivos).toBeGreaterThan(0);
    expect(d.inventario.kgTotalesActivos).toBeGreaterThan(0);
    expect(d.inventario.pesoAvgActivos).toBeGreaterThan(300);
    expect(d.inventario.pesoAvgActivos).toBeLessThan(700);
  });

  it("Mollendo tiene >800 animales activos", async () => {
    const d = await getDashboardCabecera();
    expect(d.inventario.animalesActivos).toBeGreaterThan(800);
  });

  it("zona venta está en rango razonable", async () => {
    const d = await getDashboardCabecera();
    expect(d.zonaVenta.animales).toBeGreaterThan(0);
    expect(d.zonaVenta.valorEstimadoUsd).toBeGreaterThan(100_000);
    expect(d.zonaVenta.valorEstimadoUsd).toBeLessThan(2_000_000);
  });

  it("alarmas no son negativas", async () => {
    const d = await getDashboardCabecera();
    expect(d.alarmas.resguardoCarne).toBeGreaterThanOrEqual(0);
    expect(d.alarmas.reclamables).toBeGreaterThanOrEqual(0);
    expect(d.alarmas.sinPesar60d).toBeGreaterThanOrEqual(0);
    expect(d.alarmas.edadImposible).toBeGreaterThanOrEqual(0);
  });
});

describe("Animal — caso crítico DIIO 26206180", () => {
  it("existe y tiene los campos clave", async () => {
    const a = await getAnimal("26206180");
    expect(a).not.toBeNull();
    expect(a!.diio).toBe("26206180");
    expect(a!.tipoGanado).toBe("Novillo");
    expect(a!.estado).toBe("Vivo");
    expect(a!.proveedor).toBe("Santa Isabel");
  });

  it("es reclamable (GDP < 1.2 sostenido)", async () => {
    const a = await getAnimal("26206180");
    expect(a!.esReclamable).toBe(true);
    expect(a!.gdpConfiable).toBeLessThan(1.2);
  });

  it("perdió peso en feedlot (kgGanados negativo)", async () => {
    const a = await getAnimal("26206180");
    expect(a!.kgGanados).toBeLessThan(0);
  });

  it("no es vendible (peso < 450 kg)", async () => {
    const a = await getAnimal("26206180");
    expect(a!.esVendible).toBe(false);
  });

  it("DIIO inexistente devuelve null", async () => {
    const a = await getAnimal("99999999");
    expect(a).toBeNull();
  });
});

describe("Pesajes de un animal", () => {
  it("DIIO 26206180 tiene >=3 pesajes ordenados", async () => {
    const ps = await getPesajesAnimal("26206180");
    expect(ps.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ps.length; i++) {
      const curr = ps[i]?.fechaPesaje ?? "";
      const prev = ps[i - 1]?.fechaPesaje ?? "";
      expect(curr >= prev).toBe(true);
    }
  });

  it("todos los pesos son positivos y razonables", async () => {
    const ps = await getPesajesAnimal("26206180");
    for (const p of ps) {
      expect(p.pesoKg).toBeGreaterThan(0);
      expect(p.pesoKg).toBeLessThan(2000);
    }
  });
});

describe("Ranking de proveedores", () => {
  it("devuelve >=3 proveedores con datos confiables", async () => {
    const ps = await listProveedores();
    const evaluables = ps.filter((p) => p.animalesEvaluables > 0);
    expect(evaluables.length).toBeGreaterThanOrEqual(3);
  });

  it("Santa Isabel tiene más de 200 animales evaluables", async () => {
    const p = await getProveedor("Santa Isabel");
    expect(p).not.toBeNull();
    expect(p!.animalesEvaluables).toBeGreaterThan(200);
  });

  it("cohortes nuevas tienen GDP null (sin artefacto)", async () => {
    const p = await getProveedor("Santa Alejandra");
    expect(p).not.toBeNull();
    expect(p!.gdpAvg).toBeNull();
    expect(p!.animalesEvaluables).toBe(0);
  });

  it("ranking ordenado por GDP desc (nulls al final)", async () => {
    const ps = await listProveedores();
    const conGdp = ps.filter((p) => p.gdpAvg != null);
    for (let i = 1; i < conGdp.length; i++) {
      const curr = conGdp[i]?.gdpAvg;
      const prev = conGdp[i - 1]?.gdpAvg;
      expect(curr ?? 0).toBeLessThanOrEqual(prev ?? Number.MAX_VALUE);
    }
  });
});

describe("listAnimalesActivos", () => {
  it("filtro por proveedor devuelve solo de ese proveedor", async () => {
    const lista = await listAnimalesActivos({
      proveedor: "Santa Isabel",
      limit: 50,
    });
    expect(lista.length).toBeGreaterThan(0);
    for (const a of lista) {
      expect(a.proveedor).toBe("Santa Isabel");
    }
  });

  it("filtro venta_inmediata devuelve animales >=530 kg", async () => {
    const lista = await listAnimalesActivos({
      prioridadVenta: "venta_inmediata",
      limit: 200,
    });
    for (const a of lista) {
      expect(a.pesoActualKg).toBeGreaterThanOrEqual(530);
    }
  });
});

describe("Alarmas resguardo carne", () => {
  it("devuelve array (puede estar vacío)", async () => {
    const al = await listAlarmasResguardoCarne();
    expect(Array.isArray(al)).toBe(true);
    for (const a of al) {
      expect(a.diasFaltantes).toBeGreaterThan(0);
    }
  });
});

describe("Ventas", () => {
  it("listVentas con limit retorna ese máximo", async () => {
    const vs = await listVentas({ limit: 5 });
    expect(vs.length).toBeLessThanOrEqual(5);
    for (const v of vs) {
      expect(v.numeroVenta).toBeGreaterThan(0);
      expect(v.pesoTotalKg).toBeGreaterThan(0);
    }
  });

  it("ordenado por fecha desc", async () => {
    const vs = await listVentas({ limit: 10 });
    for (let i = 1; i < vs.length; i++) {
      const curr = vs[i]?.fechaVenta ?? "";
      const prev = vs[i - 1]?.fechaVenta ?? "9999-99-99";
      expect(curr <= prev).toBe(true);
    }
  });
});
