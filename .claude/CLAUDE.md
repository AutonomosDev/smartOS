# .claude/CLAUDE.md — smartOS

Reglas operativas locales para Claude Code en este repo.
La documentación primaria está en `/CLAUDE.md` raíz.

## Pre-flight obligatorio

Antes de cualquier implementación:

1. ¿Existe ya algo similar?
   `find packages/{ingestion,api}/src -name "*<concepto>*"`
   Si existe → leerlo primero, no duplicar.

2. ¿Toca zona congelada? (ver `rules/frozen-zones.md`)
   STOP → reportar al usuario antes de actuar.

3. ¿Hay un patrón existente para esto?
   `grep -r "<patrón>" packages/{ingestion,api}/src`
   Antes de inventar nada nuevo.

4. ¿Es S/M/L?
   - S (<30 min, 1-2 archivos): directo
   - M (1-3 horas, 3-8 archivos): con plan corto
   - L (>3 horas, multi-domain): plan completo + confirmación

## Qué package tocar

```
ingestion (puerto :3000)   Capas 1-3 — xlsx → Bronze → Silver → Gold
api       (puerto :3001)   Capas 4-7 — REST + chat agent + actions

Si la tarea involucra:
  parser xlsx, ETL, vistas SQL, admin/consistencia    → ingestion
  endpoint REST nuevo (read), tool nueva del agente,
  mutation con dry-run, middleware auth/rate limit    → api
  cambio de shape de artifact_block emitido al UI     → api/agent/artifact-mapper.ts
```

## Patrón de slice nuevo (cuando entra tipo de archivo de AgroApp)

Replicar EXACTAMENTE este orden:

```
1 → src/db/schema/<tipo>.ts        Silver
2 → src/db/schema/<tipo>-bronze.ts Bronze
3 → exportar en src/db/schema/index.ts
4 → pnpm drizzle-kit generate --name=add_<tipo>
5 → pnpm db:migrate
6 → src/parsers/<tipo>-schema.ts   Zod
7 → src/parsers/<tipo>-xlsx.ts     ExcelJS + HEADER_MAP
8 → src/services/ingest-<tipo>.ts  GCS landing → Bronze → Silver
9 → src/routes/ingest.ts agregar route
10 → typecheck
11 → test E2E con xlsx real
12 → commit + push + Linear
```

## Reglas de schema

- Bronze: SIEMPRE jsonb append-only con ingest_id, source_file, row_number
- Silver: solo columnas que la app realmente lee
- UNIQUE explícito por tipo de evento (ver patrón en CLAUDE.md raíz)
- Indexes en columnas de query frecuente
- Drizzle no edita SQL a mano — usar `db:generate`
- Migration journal SOLO se edita manual cuando se agregan vistas SQL puras

## Zod por tipo

- DIIO siempre coerce string|number → regex /^\d{6,10}$/
- Fechas: requiredIsoDate o optionalIsoDate (ISO yyyy-mm-dd)
- Pesos: validar rango (0, 2000) kg
- Edades: validar rango razonable
- Resto: optionalString / optionalInt
- Filas que fallan Zod → errors[] del response, NO entran a Bronze ni Silver

## Idempotencia por tipo

```
snapshot       upsert por DIIO (onConflictDoUpdate)
evento simple  UNIQUE (diio, fecha) + onConflictDoNothing
evento rico    content_hash UNIQUE + onConflictDoNothing
padre-hijo     FK estricto + UNIQUE en hijo
único          UNIQUE diio (animal solo sale 1 vez)
```

## Vistas SQL en migrations

Cuando agregás una vista (no tabla), drizzle-kit no la genera.
Patrón:

```
1. Crear archivo manualmente: src/db/migrations/00NN_<descripción>.sql
2. Editar src/db/migrations/meta/_journal.json — agregar entry
3. pnpm db:migrate aplica el SQL
4. Si la vista debe aparecer en /admin/consistencia, editar
   src/services/consistencia.ts CHECKS array
```

## Patrón de tool nueva del agente (Capa 5)

Cuando agregás una read tool al chat agent:

```
1 → packages/api/src/agent/tools.ts
    → push a CATTLE_TOOLS con shape Anthropic
    → handler en EXECUTORS map
2 → si la tool produce data renderizable:
    packages/api/src/agent/artifact-mapper.ts
    → agregar mapper + entry en switch dispatcher
    → smartcow chat-panel renderea automático
3 → packages/api/src/__tests__/<tool>.test.ts
    + extender artifact-mapper.test.ts
4 → typecheck + vitest + E2E con curl /chat/stream
5 → commit + Linear
```

Para write tools (Capa 6) usar `tools-write.ts` + `routes/agent-actions.ts`
con dry-run + audit obligatorio.

## Verificación obligatoria antes de commit

```bash
pnpm -r typecheck                 # verde
pnpm -F @smartos/api test         # 80 tests pass
docker compose ps                 # postgres + fake-gcs running

# Ingestion
curl localhost:3000/health        # 200
curl localhost:3000/admin/consistencia

# API
curl localhost:3001/health
curl -N -X POST localhost:3001/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"dame el dashboard"}]}' | head
```

## NO hacer

- ❌ Editar SQL de migrations ya aplicada (crear nueva en vez)
- ❌ Cambiar TENANCY constants sin discusión
- ❌ Agregar columna a Silver sin pasar por migration generada
- ❌ Confiar en cálculos de AgroApp (siempre recalcular)
- ❌ Loguear DIIO + nombres en mismo log (PII)
- ❌ Commitear archivos en `data-agroapp/` (data del cliente)

## Investigación antes de afirmar

Cuando un dato parece raro (GDP > 2, edad imposible, peso negativo):

1. NO celebrar — buscar artefacto primero
2. Verificar con SQL: count, distribución, samples
3. Cruzar con otra tabla (pesajes vs ventas vs bajas)
4. Si patrón sistemático apunta a un proveedor → flag operacional
5. Solo después de descartar artefacto → reportar como hallazgo

## Comunicación con Cesar

- Números crudos > opinión
- Code-block format en respuestas (separadores ──, emojis como markers)
- Una pregunta concreta a la vez
- "Procedo" / "Dale" = ejecutar sin preguntar más
- "Investigar" = SQL real, no especulación

## Linear

```
Project       a98e9696-def5-466c-97bb-90f9b9ea3ea2
Team          Autonomos Lab (b0184c23-...)

Milestones por capa
  Capa 1 Ingestion       bb0e4f0a-8ac2-446c-a350-36a941a81127
  Capa 2 Storage         3e5d0313-80e4-4a35-b4d6-c617c1e8391f
  Capa 3 Transformation  ccb88f72-b8e2-4714-9cc6-b41ed08d1a68
  Capa 4 Ontology        9acffcbc-96b2-43be-b251-dc3903003ab5
  Capa 5 Brains          c08939bc-8765-4bce-88ac-adb80e84b0d0
  Capa 6 Action          c607eb2b-41c7-4384-91af-566a4de94db5
  Capa 7 Governance      3ccb0dcd-afcc-43a9-b28d-09112d96262f
  SmartCow × Template    04de2966-9301-440d-941f-f2bfc506f72c
```

Crear ticket por slice nuevo. Cerrar con commit hash + DOD.
