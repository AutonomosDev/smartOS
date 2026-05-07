import { Hono } from "hono";
import { z } from "zod";
import {
  getAnimal,
  getPesajesAnimal,
  getTratamientosAnimal,
  listAnimalesActivos,
} from "../ontology/animal.js";
import {
  getDashboardCabecera,
  listAlarmasResguardoCarne,
} from "../ontology/alarma.js";
import { getProveedor, listProveedores } from "../ontology/proveedor.js";
import { getVenta, listVentas } from "../ontology/venta.js";

export const v1Router = new Hono();

const PrioridadVentaQuery = z.enum([
  "venta_inmediata",
  "venta_proxima_30d",
  "venta_proxima_60d",
]);

// Animales
v1Router.get("/animales", async (c) => {
  const proveedor = c.req.query("proveedor") || undefined;
  const prioridad = c.req.query("prioridadVenta");
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
  let prioridadVenta: z.infer<typeof PrioridadVentaQuery> | undefined;
  if (prioridad) {
    const parsed = PrioridadVentaQuery.safeParse(prioridad);
    if (!parsed.success) {
      return c.json({ error: "invalid_prioridad", expected: PrioridadVentaQuery.options }, 400);
    }
    prioridadVenta = parsed.data;
  }
  return c.json(await listAnimalesActivos({ proveedor, prioridadVenta, limit }));
});

v1Router.get("/animales/:diio", async (c) => {
  const animal = await getAnimal(c.req.param("diio"));
  if (!animal) return c.json({ error: "not_found" }, 404);
  return c.json(animal);
});

v1Router.get("/animales/:diio/pesajes", async (c) => {
  return c.json(await getPesajesAnimal(c.req.param("diio")));
});

v1Router.get("/animales/:diio/tratamientos", async (c) => {
  return c.json(await getTratamientosAnimal(c.req.param("diio")));
});

// Proveedores
v1Router.get("/proveedores", async (c) => {
  return c.json(await listProveedores());
});

v1Router.get("/proveedores/:nombre", async (c) => {
  const p = await getProveedor(decodeURIComponent(c.req.param("nombre")));
  if (!p) return c.json({ error: "not_found" }, 404);
  return c.json(p);
});

// Ventas
v1Router.get("/ventas", async (c) => {
  const desde = c.req.query("desde") || undefined;
  const hasta = c.req.query("hasta") || undefined;
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
  return c.json(await listVentas({ desde, hasta, limit }));
});

v1Router.get("/ventas/:numero", async (c) => {
  const num = Number(c.req.param("numero"));
  if (!Number.isFinite(num)) return c.json({ error: "invalid_number" }, 400);
  const v = await getVenta(num);
  if (!v) return c.json({ error: "not_found" }, 404);
  return c.json(v);
});

// Alarmas + dashboard
v1Router.get("/alarmas/resguardo-carne", async (c) => {
  return c.json(await listAlarmasResguardoCarne());
});

v1Router.get("/dashboard", async (c) => {
  return c.json(await getDashboardCabecera());
});
