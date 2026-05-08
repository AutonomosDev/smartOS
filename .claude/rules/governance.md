# Governance — smartOS Capa 7 (MVP)

Reglas de seguridad y operación para endpoints
expuestos. Versión MVP single-tenant.

## Auth Bearer (env-based)

Variable env: `SMARTOS_API_TOKEN`

Si está seteada → todo endpoint protegido exige
`Authorization: Bearer <SMARTOS_API_TOKEN>`.

Si no está seteada → modo dev local: pasa todo.

```bash
# Generar token nuevo
uuidgen
# 7B3F2A...

# .env (gitignored)
SMARTOS_API_TOKEN=7B3F2A-...

# Cliente
curl -H "Authorization: Bearer 7B3F2A-..." \
  http://localhost:3001/chat
```

Reemplazo futuro: Clerk/Auth0 + JWT + RBAC real.
Por ahora es shared secret — válido para MVP, NO
para multi-usuario en producción.

## Rate limit (in-memory)

Defaults por scope:

| Scope    | Endpoints                       | Límite      |
|----------|---------------------------------|-------------|
| global   | TODO request                    | 120/min/IP  |
| chat     | POST /chat                      | 30/min/IP   |
| chat-stream | POST /chat/stream            | 30/min/IP   |
| sesiones | /chat/sesiones/*                | 60/min/IP   |
| actions  | POST /agent/actions             | 30/min/IP   |

Headers en cada response:
  `X-RateLimit-Limit`
  `X-RateLimit-Remaining`
  `Retry-After` (si 429)

Implementación in-memory por proceso. Multi-instancia
requiere migrar a Redis (no urgente con 1 cliente).

## Endpoints PROTEGIDOS

Requieren auth + rate limit:
  POST /chat
  POST /chat/stream
  POST /chat/sesiones (CRUD)
  POST /agent/actions

PÚBLICOS (solo rate limit global):
  GET /health
  GET /api/v1/* (ontología read-only)

Decisión: la ontología read-only se expone sin auth
porque es analítica. Cuando llegue multi-tenant,
agregamos auth ahí también con tenant_id en JWT.

## Datos del cliente — qué SÍ se loguea, qué NO

LOGUEAR (en chat_mensajes / agent_actions):
  ✓ Pregunta del usuario
  ✓ Tool calls + inputs
  ✓ Result preview
  ✓ Tokens / costo / cache hit

NO LOGUEAR (PII):
  ✗ Nombres reales de operadores en logs sin hash
  ✗ Emails / RUT / direcciones
  ✗ Coordenadas geográficas precisas

Hoy `creado_por` se guarda como string (riesgo PII).
Cuando aparezca segundo cliente: hashear o
referenciar a tabla users.

## Compliance SAG (cuando entremos a prod)

- Audit log inmutable (`agent_actions`) → ya tenemos
- Resguardo carne enforced en `simulate` → ya tenemos
- Backup diario de DB → pendiente infra
- Retention 7 años → pendiente infra
- Log WORM → Postgres normal por ahora; mover a
  bucket inmutable para compliance estricto

## CORS

NO está configurado. Para uso desde browser (frontend
en otro dominio), agregar `hono/cors`:

```ts
import { cors } from "hono/cors";
app.use("*", cors({ origin: ["https://app.smartos.cl"] }));
```

## Próximos pasos (post-MVP)

- JWT real (Clerk o Auth0) con roles
- RBAC: viewer/operador/veterinario/admin_org/superadmin
  ya está en código (ROLE_RANK), falta pegar al token
- RLS en Postgres por tenant_id
- Sentry para errores
- Langfuse para LLM observability
- WAF (Cloudflare) si exposición pública
