# CLAUDE.md — smartOS

Guía operativa para Claude Code en este repo. Lee primero este archivo.

## Qué es smartOS

Template multi-vertical para apps con IA estructurado en 7 capas estilo Palantir.
Hoy implementada **Capa 1 — Ingestion Layer** end-to-end, validada con data real
de **Mollendo** (operación Los Lagos de Agrícola Mollendo SA / AMSA), feedlot de
novillos en Chile.

```
LLM solo en bordes (entrada / salida).
Backend = lenguaje máquina (SQL, código, schemas tipados).
```

## Estado actual (2026-05-07)

```
Capa 1 — Ingestion Layer       ✅ E2E validado con Mollendo
Capa 2 — Storage Layer         🟡 Postgres puro (TimescaleDB pendiente)
Capa 3 — Transformation        🟡 Vistas SQL Gold/consistencia (parcial)
Capa 4 — Ontology              ⏳ pendiente
Capa 5 — Brains/Reasoning      ⏳ pendiente
Capa 6 — Action                ⏳ pendiente
Capa 7 — Governance            ⏳ pendiente
```

## Reglas críticas

**TENANCY hardcoded — MVP único cliente**
- Empresa: Agrícola Mollendo SA (alias AMSA)
- Operación: Los Lagos
- En `packages/ingestion/src/config/tenancy.ts`
- Cuando aparezca segunda empresa → promover a tablas
- NO pasar antes a multi-tenant (regla A: no normalizar hasta segunda entidad real)

**LLENADO RUMINAL — artefacto crítico al interpretar GDP**
- Bovino entra a feedlot ayunado/deshidratado de viaje
- En 7 días llena rumen con 30-50 kg de agua + concentrado
- GDP "aparente" del primer pesaje a los 14-30 días → INFLADO
- Animales con solo 2 pesajes y <30 días → GDP no confiable
- Real GDP requiere ≥3 pesajes y ≥60 días entre primero y último

**RECLAMABLE = GDP < 1.2 kg/d sostenido**
- Ver vista `v_reclamables` (severidad: critico/muy_bajo/bajo_reclamable)
- Base documental para reclamar al proveedor

**REGLA LLM "edad imposible"**
- Animal con `tipo_ganado IN ('Novillo','Vaquilla','Vaca','Toro','Torito')`
  + edad < 6 meses + peso > 200 kg → ANOMALÍA
- Vista `v_edad_imposible` la detecta
- Casos reales: Hugo Reyes (53), Mario Hernandez (53), Sta Isabel(1) (35)
- Causa: fecha_nacimiento mal cargada en AgroApp

**NUNCA confiar en cálculos de AgroApp**
- `liberacion_carne` y `liberacion_leche` se RECALCULAN nuestros
  desde fecha_tratamiento + resguardo_dias
- Si AgroApp difiere → reportar como discrepancia (no confiar ciego)

**DIIO es único por diseño SAG**
- NO usar `agroapp_id` como identificador (residuo legacy)
- Idempotencia por DIIO o content_hash, no por id externo

## Stack

```
Lenguaje      TypeScript 5.x strict
Runtime       Node 20 LTS
Server        Hono 4.x + @hono/node-server
ORM           Drizzle 0.45 + pg
Validación    Zod 3.x (schemas runtime + tipos)
Parser xlsx   ExcelJS 4.4
Storage       postgres:16-alpine + fake-gcs-server (local)
Workspaces    pnpm 9
CI            GitHub Actions (typecheck en PR)
```

## Comandos

```bash
# Setup inicial (5 comandos)
pnpm install
cp .env.example .env
docker compose up -d
pnpm -F @smartos/ingestion dev    # server en :3000
curl http://localhost:3000/health

# Ingestión
curl -X POST http://localhost:3000/ingest/inventario       -F "file=@xxx.xlsx"
curl -X POST http://localhost:3000/ingest/pesajes          -F "file=@xxx.xlsx"
curl -X POST http://localhost:3000/ingest/tratamientos     -F "file=@xxx.xlsx"
curl -X POST http://localhost:3000/ingest/ventas           -F "file=@xxx.xlsx"
curl -X POST http://localhost:3000/ingest/ventas-detalle   -F "file=@xxx.xlsx"
curl -X POST http://localhost:3000/ingest/bajas            -F "file=@xxx.xlsx"

# Admin
curl http://localhost:3000/admin/consistencia              # 7 checks

# DB
pnpm -F @smartos/ingestion db:generate    # genera migration desde schema TS
pnpm -F @smartos/ingestion db:migrate     # aplica migrations pendientes
pnpm -F @smartos/ingestion db:studio      # UI de Drizzle Studio

# Verificación
pnpm -r typecheck                          # typecheck workspace completo
```

## Arquitectura — Capa 1 (única implementada)

```
upload xlsx
    ↓
GCS landing (fake-gcs local en :4443)
    ↓ md5 + size + uri guardados en `landings`
parser exceljs
    ↓ HEADER_MAP literal → keys normalizadas
Zod validation (schemas por tipo)
    ↓ filas que fallan → errors[] del response
Bronze (jsonb append-only)
    ↓ raw fiel del xlsx + ingest_id
Silver (typed columns)
    ↓ upsert por DIIO o content_hash
        según tipo de evento
response JSON con counts + errors + alarms
```

## Estructura del repo

```
smartOS/
├── .github/workflows/ci.yml
├── packages/ingestion/
│   ├── drizzle.config.ts
│   ├── src/
│   │   ├── server.ts              Hono + montaje routes
│   │   ├── config/tenancy.ts      AMSA / Los Lagos
│   │   ├── db/
│   │   │   ├── client.ts          drizzle + pool
│   │   │   ├── schema/            13 archivos de tablas
│   │   │   └── migrations/        9 migrations (.sql)
│   │   ├── parsers/               1 schema Zod + 1 xlsx parser por tipo
│   │   ├── services/              1 ingest-* por tipo + consistencia
│   │   ├── routes/                ingest.ts + admin.ts
│   │   └── storage/gcs.ts         cliente fake-gcs compatible
│   └── package.json
├── docker-compose.yml             postgres + fake-gcs
├── data-agroapp/                  data del cliente (.gitignore)
├── README.md
└── CLAUDE.md                      este archivo
```

## Tablas Silver (8) y Bronze (5 + landings)

```
SILVER                          BRONZE
animales (17 cols, upsert)      inventario_bronze (jsonb)
pesajes (13 cols, UNIQUE        pesajes_bronze
        diio+fecha)
tratamientos (26 cols,          tratamientos_bronze
        UNIQUE content_hash)
ventas (cabecera, UNIQUE        ventas_bronze
        numero_venta)
ventas_animales (FK estricto)   ventas_animales_bronze
bajas (UNIQUE diio)             bajas_bronze
landings (audit GCS)
```

## Vistas SQL (8)

```
NORMALIZACIÓN                   v_proveedor_canonico

CONSISTENCIA (5)                v_zombies_bajas
                                v_zombies_vendidos
                                v_pesajes_huerfanos
                                v_tratamientos_a_muertos
                                v_inventario_stale

ALERTAS (2)                     v_edad_imposible
                                v_reclamables
```

## Tipos de archivo AgroApp soportados

```
Tipo            Patrón          Idempotencia
─────────────────────────────────────────────
inventario      snapshot        upsert por DIIO
pesajes         evento simple   UNIQUE (diio, fecha)
tratamientos    evento rico     UNIQUE content_hash
ventas          padre-hijo      UNIQUE numero_venta
                                + UNIQUE (venta_id, diio)
bajas           evento único    UNIQUE (diio)
```

## Decisiones arquitectónicas clave

**REGLA A — sobre tablas (entidades)**
No crear tabla nueva hasta tener segunda entidad real del mismo tipo.
Por eso TENANCY es constante, no tabla `empresas` + `operaciones`.

**REGLA B — sobre columnas (atributos)**
Si la fuente define el campo en su schema canónico, sumarlo a Silver
aunque venga vacío. Postgres maneja NULLs gratis. Migración futura
es cara.

**Bronze SIEMPRE completo**
- Audit trail jsonb append-only
- Si parser tiene bug → reprocesar desde Bronze
- Si Postgres se cae → reprocesar desde GCS

**Silver SOLO lo que la app lee**
- Tipos correctos, FK válidas
- Una fila por entidad
- Index en columnas de query

**2 endpoints separados > auto-detect mágico**
- Path = contrato documentado
- Errores precisos por endpoint
- Orden visible en URL

**Idempotencia obligatoria en eventos**
- Re-upload del mismo archivo NO duplica
- Bronze append (audit), Silver dedup
- onConflictDoNothing por content_hash o (diio, fecha)

## Linear

```
Project       smartOS — Template Multi-Vertical
              linear.app/autonomos-lab/project/smartos-...
Milestone     Capa 1 — Ingestion Layer
Tickets       AUT-397 Día 0 setup
              AUT-398 Slice 1 inventario
              AUT-399 Slice 4 pesajes
              AUT-400 Slice 5 tratamientos
              AUT-401 Slice 6 ventas
              AUT-402 Slice 7 bajas
```

## Conocimiento de Mollendo (cliente piloto)

```
Volumen 26 meses (mar-2024 → may-2026)
  6.381 animales únicos pasados
  31.315 pesajes registrados
  145 envíos de venta (5.542 animales)
  11 bajas (mortalidad 0.17% — excelente)
  69 tratamientos sanitarios

Inventario activo HOY    830 animales
GDP histórico cohortes   1.382 (2024) → 1.489 (2025) → +7.7%
Mortalidad               extremadamente baja
Cojera                   problema sanitario #1 (74% de tratamientos)
                         pico estacional invierno chileno (jun-ago)
Operadores               guentrepan (2024-Q1/2026) → Hernan Silva (Q2/2026)
                         tonificaciones aparecen con cambio de operador
```

## Vocabulario chileno

```
Guía de despacho     →  documento SII (tributario)
FMA                  →  Formulario de Movimiento Animal (sanitario SAG)
DIIO                 →  identificador visual del arete (único SAG)
EID                  →  RFID electrónico (chip)
Mangada              →  grupo en frigorífico durante venta
PESAJE DESDE VENTA   →  último pesaje pre-despacho al comprador
Llenado ruminal      →  +30-50 kg de agua/concentrado en rumen
                        post-ingreso (artefacto que infla GDP)
```

## Reglas de comunicación

- Cuando se discute o planifica → NO tocar código
- Análisis = números crudos sin opinión
- Verificar antes de afirmar (SQL real, no especulación)
- Bronze es safety net — siempre se puede reprocesar
- No agregar features no pedidas
- Cuando un dato parece imposible (GDP > 2 sostenido, edad
  imposible) → primero buscar artefacto/bug, no celebrar

## No tocar sin aprobación

```
Zonas estables que requieren autorización Cesar:
  packages/ingestion/src/config/tenancy.ts   (cambio de cliente)
  packages/ingestion/src/db/migrations/      (no editar SQL aplicado)
  packages/ingestion/src/storage/gcs.ts      (cliente fake-gcs frágil)
  docker-compose.yml                         (config de DB en uso)
```

## Pendientes conocidos

- Backfill `origen` para animales 2024-2025 (no se cargaba en AgroApp)
- 142 animales con edad_imposible — coordinar con AgroApp para corregir
- 38 animales reclamables → revisar caso por caso, decisión negocio
- Materializar v_dashboard_mollendo (vista consolidada)
- TimescaleDB para pesajes (cuando volumen lo justifique)
- 2do cliente / segunda operación → promover TENANCY a tablas
