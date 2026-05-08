import { describe, expect, it } from "vitest";
import { pickModel } from "../agent/router.js";

const u = (content: string) => [{ role: "user", content }];

describe("pickModel — tier router heurístico", () => {
  describe("LIGHT (haiku)", () => {
    it.each([
      "¿Cuántos animales activos hay?",
      "Cuántas ventas el mes pasado?",
      "¿Qué es el GDP del feedlot?",
      "Cuál es el peso promedio?",
      "Dame el listado de animales",
      "Mostrame el dashboard",
      "Listame las ventas del mes",
      "Estado del feedlot",
      "Resumen ejecutivo",
      "Detalle del DIIO 26206180",
      "Ficha del animal 23596818",
    ])("clasifica '%s' como light", (content) => {
      const r = pickModel(u(content));
      expect(r.tier).toBe("light");
      expect(r.model).toMatch(/haiku/i);
    });
  });

  describe("STANDARD (sonnet)", () => {
    it.each([
      "¿Por qué Lingues tiene más reclamables?",
      "Compara Santa Isabel con Valdivia",
      "Cuál proveedor es mejor?",
      "Analiza el rendimiento del feedlot",
      "¿Vale la pena seguir comprando a Doña Charo?",
      "Predice las ventas del próximo mes",
      "Hay alguna tendencia de cojera estacional?",
      "Recomendá qué animales vender primero",
      "Por qué este animal está perdiendo peso?",
      "Cuál es la diferencia entre Sta Alejandra y Sta Isabel?",
    ])("clasifica '%s' como standard", (content) => {
      const r = pickModel(u(content));
      expect(r.tier).toBe("standard");
      expect(r.model).toMatch(/sonnet/i);
    });
  });

  describe("DEFAULT y edge cases", () => {
    it("default a standard cuando no matchea ningún patrón", () => {
      const r = pickModel(u("texto random sin patrones específicos zzz"));
      expect(r.tier).toBe("standard");
    });

    it("standard si la query es muy larga (>200 chars) aún si matchea light", () => {
      const long = "Cuántos animales " + "x".repeat(250);
      const r = pickModel(u(long));
      expect(r.tier).toBe("standard");
    });

    it("usa SOLO el último mensaje del user", () => {
      const r = pickModel([
        { role: "user", content: "¿Por qué este animal está flaco?" },
        { role: "assistant", content: "..." },
        { role: "user", content: "¿Cuántos hay?" },
      ]);
      expect(r.tier).toBe("light");
    });

    it("standard si no hay user message", () => {
      const r = pickModel([{ role: "assistant", content: "hola" }]);
      expect(r.tier).toBe("standard");
      expect(r.reason).toBe("no_user_message");
    });

    it("env override SMARTOS_FORCE_TIER=light", () => {
      process.env.SMARTOS_FORCE_TIER = "light";
      const r = pickModel(u("¿Por qué Lingues tiene más reclamables?"));
      expect(r.tier).toBe("light");
      expect(r.reason).toBe("env_override");
      delete process.env.SMARTOS_FORCE_TIER;
    });

    it("env override SMARTOS_FORCE_TIER=standard", () => {
      process.env.SMARTOS_FORCE_TIER = "standard";
      const r = pickModel(u("¿Cuántos animales?"));
      expect(r.tier).toBe("standard");
      expect(r.reason).toBe("env_override");
      delete process.env.SMARTOS_FORCE_TIER;
    });
  });

  describe("REGRESIONES detectadas", () => {
    it("'Y de esos, ¿cuántos están listos?' debería ser standard (regla anchored ^)", () => {
      // Esta es una regresión documentada: el regex ^ no matchea
      // por el prefijo "Y de esos". Si en el futuro la heurística mejora,
      // este test cambia a 'light'.
      const r = pickModel(u("Y de esos, ¿cuántos están listos para venta?"));
      expect(r.tier).toBe("standard");
    });
  });
});
