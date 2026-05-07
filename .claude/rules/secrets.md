# Secrets — smartOS

## Stack actual

- Local-only por ahora (no prod deploy)
- Postgres en docker, password "smartos" hardcoded en docker-compose
- fake-gcs sin auth
- Sin secretos reales en este momento

## Cuando se agreguen

```
.env.local          (gitignored)
GCP_PROJECT_ID      proyecto real GCS (cuando dejemos fake-gcs)
DATABASE_URL        prod (Neon, Supabase o GCP)
```

## NUNCA

- ❌ Commitear `.env*` (excepto `.env.example`)
- ❌ Commitear archivos en `data-agroapp/` (data del cliente)
- ❌ Loguear DIIO + nombres juntos (PII)
- ❌ Hardcodear keys en código
