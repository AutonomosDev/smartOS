/**
 * Tools del agente IA — wrappers de la ontología (Capa 4).
 * El LLM NO escribe SQL ni toca DB. Llama estos tools que
 * a su vez consumen las funciones ontológicas.
 *
 * Schema en formato Anthropic SDK Messages API.
 */
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

export const CATTLE_TOOLS = [
  {
    name: "get_dashboard",
    description:
      "Obtiene el resumen ejecutivo del feedlot Mollendo: animales activos, kg totales, GDP promedio confiable, valor zona venta, y conteos de alarmas. Usar cuando el usuario pregunta por el estado general, KPIs principales o resumen del feedlot.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_animal",
    description:
      "Obtiene detalle completo de UN animal por su DIIO: peso actual, días estabulado, GDP, proveedor, esVendible, esReclamable, enResguardoSanitario. Usar cuando el usuario menciona un DIIO específico.",
    input_schema: {
      type: "object" as const,
      properties: {
        diio: { type: "string", description: "DIIO del animal (6-10 dígitos)" },
      },
      required: ["diio"],
    },
  },
  {
    name: "list_animales",
    description:
      "Lista animales activos del inventario, con filtros opcionales por proveedor (nombre canónico) y prioridad de venta (venta_inmediata, venta_proxima_30d, venta_proxima_60d). Usar cuando se pide ver lista de animales o filtrar por características.",
    input_schema: {
      type: "object" as const,
      properties: {
        proveedor: {
          type: "string",
          description:
            "Nombre canónico del proveedor: Santa Isabel, Santa Alejandra, Doña Charo, Lingues, Valdivia, El Pampero, Mollendo (interno), Hugo Reyes, Mario Hernandez, Winkler",
        },
        prioridadVenta: {
          type: "string",
          enum: ["venta_inmediata", "venta_proxima_30d", "venta_proxima_60d"],
          description:
            "Prioridad de venta basada en peso: inmediata (>=530kg), 30d (>=500kg), 60d (>=450kg)",
        },
        limit: {
          type: "integer",
          description: "Cantidad máxima de animales a retornar (default 50, max 200)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_pesajes_animal",
    description:
      "Obtiene historial completo de pesajes de un animal específico (todas las fechas y pesos). Útil para analizar evolución de peso, GDP entre pesajes, o auditar.",
    input_schema: {
      type: "object" as const,
      properties: {
        diio: { type: "string", description: "DIIO del animal" },
      },
      required: ["diio"],
    },
  },
  {
    name: "get_tratamientos_animal",
    description:
      "Obtiene historial sanitario de un animal: medicamentos aplicados, diagnósticos, fechas, resguardos y liberación carne/leche. Indica si está actualmente en resguardo (no faenable).",
    input_schema: {
      type: "object" as const,
      properties: {
        diio: { type: "string", description: "DIIO del animal" },
      },
      required: ["diio"],
    },
  },
  {
    name: "list_proveedores",
    description:
      "Ranking de proveedores por GDP estabulado. Solo cuenta animales con GDP confiable (>=3 pesajes y >=60 días). Cohortes nuevas aparecen con animalesEvaluables=0 y deben reportarse así (no comparar GDP nulo).",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_proveedor",
    description: "Detalle de un proveedor específico por nombre canónico.",
    input_schema: {
      type: "object" as const,
      properties: {
        nombre: { type: "string", description: "Nombre canónico del proveedor" },
      },
      required: ["nombre"],
    },
  },
  {
    name: "list_ventas",
    description:
      "Lista ventas históricas con filtros opcionales por fecha. Cada venta incluye peso total, cantidad de animales y peso promedio.",
    input_schema: {
      type: "object" as const,
      properties: {
        desde: { type: "string", description: "Fecha desde YYYY-MM-DD" },
        hasta: { type: "string", description: "Fecha hasta YYYY-MM-DD" },
        limit: { type: "integer", description: "Cantidad máxima (default 50)" },
      },
      required: [],
    },
  },
  {
    name: "get_venta",
    description: "Detalle de una venta específica por número.",
    input_schema: {
      type: "object" as const,
      properties: {
        numeroVenta: { type: "integer", description: "Número de venta (ID)" },
      },
      required: ["numeroVenta"],
    },
  },
  {
    name: "list_alarmas_resguardo",
    description:
      "Lista animales actualmente en resguardo sanitario (no faenables hoy). Incluye fecha de tratamiento, medicamento, fecha de liberación de carne y días faltantes hasta poder faenar legalmente.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
] as const;

/**
 * Ejecuta una tool por nombre. Devuelve el resultado serializable
 * para devolver al modelo en el siguiente turno.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_dashboard":
      return await getDashboardCabecera();
    case "get_animal": {
      const diio = String(input.diio ?? "");
      const a = await getAnimal(diio);
      return a ?? { error: "not_found", diio };
    }
    case "list_animales":
      return await listAnimalesActivos({
        proveedor: input.proveedor as string | undefined,
        prioridadVenta: input.prioridadVenta as
          | "venta_inmediata"
          | "venta_proxima_30d"
          | "venta_proxima_60d"
          | undefined,
        limit: input.limit as number | undefined,
      });
    case "get_pesajes_animal":
      return await getPesajesAnimal(String(input.diio ?? ""));
    case "get_tratamientos_animal":
      return await getTratamientosAnimal(String(input.diio ?? ""));
    case "list_proveedores":
      return await listProveedores();
    case "get_proveedor": {
      const p = await getProveedor(String(input.nombre ?? ""));
      return p ?? { error: "not_found", nombre: input.nombre };
    }
    case "list_ventas":
      return await listVentas({
        desde: input.desde as string | undefined,
        hasta: input.hasta as string | undefined,
        limit: input.limit as number | undefined,
      });
    case "get_venta": {
      const num = Number(input.numeroVenta);
      if (!Number.isFinite(num)) return { error: "invalid_number" };
      const v = await getVenta(num);
      return v ?? { error: "not_found", numeroVenta: num };
    }
    case "list_alarmas_resguardo":
      return await listAlarmasResguardoCarne();
    default:
      return { error: "unknown_tool", name };
  }
}
