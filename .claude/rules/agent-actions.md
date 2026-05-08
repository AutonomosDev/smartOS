# Agent Actions — pattern obligatorio para Capa 6

Cuando el agente IA pueda EJECUTAR acciones (no solo
leer datos), TODAS las mutations deben seguir este
patrón sin excepción.

## Regla 1 — Dry-run por default

Toda tool de mutation acepta param `dryRun: boolean`
con default `true`.

```typescript
{
  name: "registrar_pesaje",
  input_schema: {
    properties: {
      diio: { type: "string" },
      peso_kg: { type: "number" },
      fecha: { type: "string" },
      dry_run: {
        type: "boolean",
        default: true,
        description:
          "Si true, simula la operación y devuelve el efecto. Si false, ejecuta.",
      },
    },
    required: ["diio", "peso_kg", "fecha"],
  },
}
```

El sistema enforza:
```typescript
async function executeWriteTool(name, input) {
  const dryRun = input.dry_run !== false;  // default true
  if (dryRun) {
    return await simulate(name, input);    // sin tocar DB
  }
  return await execute(name, input);       // con auditoría
}
```

## Regla 2 — Confirmación human-in-the-loop

El cliente del agente (UI o API) debe:

1. Llamar al tool con `dry_run: true` (default)
2. Mostrar al usuario el efecto simulado
3. Pedir confirmación EXPLÍCITA
4. Llamar de nuevo con `dry_run: false`

NUNCA el agente decide solo ejecutar. Siempre hay
un humano que aprueba la mutation.

## Regla 3 — Idempotency keys obligatorias

Toda mutation acepta `idempotency_key: string` (uuid).
Si la misma key llegó en últimos 24h, el sistema
devuelve el resultado anterior sin re-ejecutar.

Previene:
- Double-click (UI)
- Retry del cliente tras timeout
- Reintentos del agente tras error transitorio

## Regla 4 — Audit log inmutable

Toda mutation ejecutada (no dry-run) escribe a tabla
`agent_actions`:

```sql
CREATE TABLE agent_actions (
  id              uuid PRIMARY KEY,
  sesion_id       uuid REFERENCES chat_sesiones,
  tool_name       text NOT NULL,
  input           jsonb NOT NULL,
  result          jsonb NOT NULL,
  status          text NOT NULL,            -- success/error
  error_detail    text,
  idempotency_key text UNIQUE NOT NULL,
  user_confirmed  boolean NOT NULL,         -- false bloquea
  executed_at     timestamptz DEFAULT now()
);
```

Esta tabla es WRITE-ONCE. Nunca DELETE, nunca UPDATE.
Compliance SAG y trazabilidad legal.

## Regla 5 — Rollback strategies documentadas

Cada tool de mutation tiene un campo `reversibility`:

```typescript
{
  name: "registrar_pesaje",
  reversibility: "soft",   // se puede UPDATE el registro
  rollback_window_hours: 24,
}

{
  name: "registrar_baja",
  reversibility: "hard",   // requiere proceso manual
  rollback_window_hours: 0,
}
```

Si `hard`, la confirmación del paso 2 debe ser DOBLE
("¿Estás seguro? Esto NO se puede deshacer").

## Regla 6 — Permission check (Capa 7)

Cada tool de mutation declara `required_role`:

```typescript
{
  name: "registrar_venta",
  required_role: "admin_org",
}
```

El sistema verifica en runtime contra la sesión.
Si no tiene rol → tool no se expone al agente
(no aparece en el catálogo de tools enviado al LLM).

## Regla 7 — Rate limit por mutation

Mutations con efecto físico (registrar pesaje, baja,
venta) tienen rate limit duro:
- Máx 100 por sesión por hora
- Máx 1.000 por org por hora

Previene escenarios de "agente loco" que ejecuta
acciones en loop.

---

## Tools de READ — NO aplica este patrón

`get_animal`, `list_proveedores`, `list_ventas`, etc
son read-only y NO requieren dry-run, idempotency,
ni audit. La Capa 5 actual sólo tiene tools de read.

---

## Implementación referencial

Cuando se construya Capa 6:

1. Crear `packages/api/src/agent/tools-write.ts`
   (separado de `tools.ts` que es read-only)
2. Crear `packages/api/src/services/agent-actions.ts`
   con `executeWriteTool()` que enforza el patrón
3. Migration `00NN_agent_actions.sql` con la tabla
4. Tests unitarios de cada tool con dry_run=true Y false
5. Tests de regresión: agente NO ejecuta sin confirmación

## Justificación

Documentado tras crítica de Capa 5 (commit d0cbcb7):
agente con drift de ~2 animales en lectura.
En Capa 6 ese drift sería:
- pesaje incorrecto registrado en DB
- venta duplicada
- baja errónea
- faena de animal en resguardo (violación SAG)

Estas reglas hacen IMPOSIBLE esos escenarios por
diseño, no por confianza en el LLM.
