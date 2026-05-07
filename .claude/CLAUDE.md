# .claude/CLAUDE.md — smartOS

Reglas operativas locales para Claude Code en este repo.
La documentación primaria está en `/CLAUDE.md` raíz.

## Pre-flight obligatorio

Antes de cualquier implementación:

1. ¿Existe ya algo similar?
   `find packages/ingestion/src -name "*<concepto>*"`
   Si existe → leerlo primero, no duplicar.

2. ¿Toca zona congelada? (ver `rules/frozen-zones.md`)
   STOP → reportar al usuario antes de actuar.

3. ¿Hay un patrón existente para esto?
   `grep -r "<patrón>" packages/ingestion/src`
   Antes de inventar nada nuevo.

4. ¿Es S/M/L?
   - S (<30 min, 1-2 archivos): directo
   - M (1-3 horas, 3-8 archivos): con plan corto
   - L (>3 horas, multi-domain): plan completo + confirmación

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

## Verificación obligatoria antes de commit

```bash
pnpm typecheck                    # verde
docker compose ps                 # postgres + fake-gcs running
curl localhost:3000/health        # 200
curl /admin/consistencia          # checks correctos
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
Milestone     Capa 1 — Ingestion Layer (bb0e4f0a-...)
```

Crear ticket por slice nuevo. Cerrar con commit hash + DOD.
