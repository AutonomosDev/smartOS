# Zonas congeladas — smartOS

Módulos validados con data real de Mollendo. **NO modificar sin
autorización explícita de Cesar.** Si necesitás tocar uno, reportar
el conflicto antes de actuar.

| Módulo | Path | Razón |
|--------|------|-------|
| Tenancy hardcoded | `packages/ingestion/src/config/tenancy.ts` | MVP single-cliente. Cambiar = cambiar contrato del sistema |
| GCS client | `packages/ingestion/src/storage/gcs.ts` | Compatibilidad fake-gcs delicada (apiEndpoint + useAuthWithCustomEndpoint:false). No tocar el handshake |
| Migrations aplicadas | `packages/ingestion/src/db/migrations/*.sql` | Una vez aplicada en prod, no se edita. Crear nueva migration |
| docker-compose | `docker-compose.yml` | Postgres en uso. Cambios pueden romper data |
| Schema Silver `animales` | `packages/ingestion/src/db/schema/animales.ts` | 17 cols del schema canónico AgroApp. Agregar columnas requiere migration + actualizar parser + service |
| GDP calc lógica | parser de pesajes y vista `v_reclamables` | Definición de "reclamable" tiene impacto comercial |

## Regla

Cambio en zona congelada requiere:
1. Reportar a Cesar antes
2. Confirmación explícita
3. Typecheck verde
4. Test E2E del flujo afectado
5. Comentario en Linear con commit hash
