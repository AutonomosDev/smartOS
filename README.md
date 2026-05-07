# smartOS

Template multi-vertical para apps con IA. 7 capas estilo Palantir (Ingestion → Storage → Transformation → Ontology → Brains → Action → Governance).

LLM solo en los bordes (entrada/salida). Backend = lenguaje máquina (SQL, código, schemas tipados).

## Setup en 5 comandos

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm -F @smartos/ingestion dev
curl http://localhost:3000/health
```

Respuesta esperada:

```json
{"status":"ok","layer":"ingestion"}
```

## Estructura

```
smartOS/
├── packages/
│   └── ingestion/        Capa 1 — entrada de datos (Hono + Zod)
├── docker-compose.yml    postgres:16 + fake-gcs (emulator local)
├── tsconfig.base.json    TS strict compartido
└── .github/workflows/    CI: typecheck en cada PR
```

Capas 2-7 se agregan como packages adicionales conforme se validan.

## Stack

| Capa | Tooling |
|------|---------|
| 1. Ingestion | Hono · Zod · GCS (fake-gcs local) |
| 2. Storage | Postgres 16 · TimescaleDB · pgvector · PostGIS |
| 3. Transformation | dbt Core · Polars · Pandera |
| 4. Ontology | Drizzle · Cubes · GraphQL Yoga |
| 5. Brains | LiteLLM · LangGraph · router 4-niveles |
| 6. Action | Temporal Cloud (TBD) |
| 7. Governance | Cerbos · Clerk · Langfuse (TBD) |

## Desarrollo

```bash
pnpm -r typecheck         # typecheck recursivo
pnpm -F @smartos/ingestion dev   # dev server con tsx watch
docker compose down       # detener infra local
```

## Licencia

MIT — ver [LICENSE](LICENSE).
