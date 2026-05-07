# Database Patterns — smartOS

## Stack

- ORM: Drizzle 0.45
- Driver: `pg` (node-postgres)
- DB: `postgres:16-alpine` en docker
- Migrations: drizzle-kit

## NUNCA

- ❌ Raw SQL con `pg.Pool` directo en código de aplicación
- ❌ Editar migration ya aplicada (crear nueva)
- ❌ `db:push` en prod (solo dev, usar `db:migrate`)
- ❌ Bronze sin `ingest_id` ni `source_file`
- ❌ Silver sin UNIQUE/PK explícito

## Schema convention

```typescript
export const xxx = pgTable("xxx", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  // identificación
  diio: text("diio").notNull(),
  // dominio
  // ...
  // metadata ingesta
  ingestedAt: timestamp("ingested_at", { withTimezone: true })
    .notNull().defaultNow(),
  sourceFile: text("source_file"),
}, (t) => [
  uniqueIndex("xxx_unique_idx").on(t.diio),
  index("xxx_diio_fecha_idx").on(t.diio, t.fecha),
]);
```

## Bronze pattern (idéntico para todos)

```typescript
export const xxxBronze = pgTable("xxx_bronze", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ingestId: uuid("ingest_id").notNull().default(sql`gen_random_uuid()`),
  sourceFile: text("source_file").notNull(),
  rowNumber: integer("row_number").notNull(),
  raw: jsonb("raw").notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true })
    .notNull().defaultNow(),
}, (t) => [
  index("xxx_bronze_ingest_id_idx").on(t.ingestId),
  index("xxx_bronze_ingested_at_idx").on(t.ingestedAt),
]);
```

## Idempotencia por tipo

```typescript
// Snapshot (inventario): upsert
.insert(animales).values(rows).onConflictDoUpdate({
  target: animales.diio,
  set: { /* todas las cols */ ingestedAt: sql`now()` }
})

// Evento simple (pesajes): conflict do nothing
.insert(pesajes).values(rows).onConflictDoNothing({
  target: [pesajes.diio, pesajes.fechaPesaje]
})

// Evento rico (tratamientos): content_hash
.insert(tratamientos).values(rows).onConflictDoNothing({
  target: tratamientos.contentHash
})
```

## Vistas SQL (no manejadas por Drizzle)

Cuando se agrega vista:
1. Crear archivo `00NN_descripcion.sql` con `CREATE OR REPLACE VIEW`
2. Editar `src/db/migrations/meta/_journal.json` agregar entry:
   ```json
   { "idx": NN, "version": "7", "when": <timestamp_ms>,
     "tag": "00NN_descripcion", "breakpoints": true }
   ```
3. `pnpm db:migrate` aplica
4. Si debe aparecer en `/admin/consistencia`, agregar a CHECKS

## Migration journal — entries actuales

```
0000_thankful_elektra       initial (animales + inventario_bronze)
0001_faithful_lyja          extend silver animales (cols 6-17)
0002_add_landings           tabla landings (GCS audit)
0003_add_pesajes            pesajes + bronze
0004_add_tratamientos       tratamientos + bronze
0005_add_ventas             ventas + ventas_animales + bronces (FK)
0006_add_bajas              bajas + bronze
0007_consistency_views      5 vistas SQL (zombies, huerfanos, stale)
0008_alerts_views           v_edad_imposible + v_reclamables
                            (también v_proveedor_canonico ad-hoc)
```

## Convenciones nombres

```
Tablas        snake_case singular: animal NO, animales SÍ
              (excepción: nombres ya plurales en dominio)
Bronze        <tipo>_bronze
Vistas        v_<descripción>
Columns       snake_case
              fecha_* para date
              *_at para timestamptz
              *_kg, *_dias para numérico con unidad
```
