# Zonas congeladas — smartOS

Módulos validados con data real de Mollendo. **NO modificar sin
autorización explícita de Cesar.** Si necesitás tocar uno, reportar
el conflicto antes de actuar.

## packages/ingestion (Capas 1-3)

| Módulo | Path | Razón |
|--------|------|-------|
| Tenancy hardcoded | `packages/ingestion/src/config/tenancy.ts` | MVP single-cliente. Cambiar = cambiar contrato del sistema |
| GCS client | `packages/ingestion/src/storage/gcs.ts` | Compatibilidad fake-gcs delicada (apiEndpoint + useAuthWithCustomEndpoint:false). No tocar el handshake |
| Migrations aplicadas | `packages/ingestion/src/db/migrations/*.sql` | Una vez aplicada en prod, no se edita. Crear nueva migration |
| docker-compose | `docker-compose.yml` | Postgres en uso. Cambios pueden romper data |
| Schema Silver `animales` | `packages/ingestion/src/db/schema/animales.ts` | 17 cols del schema canónico AgroApp. Agregar columnas requiere migration + actualizar parser + service |
| GDP calc lógica | parser de pesajes y vista `v_reclamables` | Definición de "reclamable" tiene impacto comercial |

## packages/api (Capas 4-7)

| Módulo | Path | Razón |
|--------|------|-------|
| Stream event shape | `packages/api/src/agent/run-stream.ts` | StreamEvent (turn_start, text_delta, tool_use, tool_result, artifact_block, done, error) es contrato con cliente smartcow. Agregar variant ok; renombrar/quitar rompe UI |
| Adapter UI | `packages/api/src/agent/artifact-mapper.ts` | Shape Artifact (`{type, title?, rows?, kpis?, items?}`) DEBE coincidir con SSEArtifact de `smartcow/src/components/chat/chat-panel.tsx`. Cambiar shape rompe el render del sidebar. Agregar mapper nuevo ok |
| CATTLE_TOOLS | `packages/api/src/agent/tools.ts` | 10 read tools del agente. Cambiar nombre o input schema invalida sesiones cacheadas y obliga a actualizar artifact-mapper en paralelo |
| Auth + rate limit | `packages/api/src/middleware/{auth,rate-limit}.ts` | Capa 7 — afecta TODOS los endpoints protegidos. Cambios requieren plan |
| Agent action 7 reglas | `packages/api/src/routes/agent-actions.ts` | dry_run + idempotency + audit + permissions + rollback + circuit + async son contrato Capa 6 — no relajar |

## Regla

Cambio en zona congelada requiere:
1. Reportar a Cesar antes
2. Confirmación explícita
3. Typecheck verde
4. Test E2E del flujo afectado
5. Comentario en Linear con commit hash
