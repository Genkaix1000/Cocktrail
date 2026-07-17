# API — OAuth de Mercado Pago (Multi-seller)

> **Cuándo leer esto**: cuando necesitás vincular una cuenta MP de un vendedor externo (Bosko) a Cocktrail, o renovar su token.
> Resultado final: `access_token` + `refresh_token` + `mp_user_id` del vendedor, guardados en `mercadopago_sellers`.

---

## Conceptos

- **Cocktrail** = la plataforma (tiene `APP_ID` = `client_id` y `CLIENT_SECRET` propios)
- **Bosko** = el vendedor que autoriza — su token es el que se usa para crear stores/pos/cobros
- **PKCE** = protección extra: generamos `code_verifier` → `code_challenge` (S256) para el state

---

## Paso 1 — Generar URL de Autorización

**Endpoint de Cocktrail**: `GET /api/mercadopago/oauth/url?barId=BARRA-01`

El backend construye esta URL y la devuelve al frontend:

```
https://auth.mercadopago.com/authorization
  ?client_id={MP_APP_ID}
  &response_type=code
  &platform_id=mp
  &state={STATE_ALEATORIO}
  &redirect_uri={MP_REDIRECT_URI}
  &code_challenge={CHALLENGE}
  &code_challenge_method=S256
```

> El `state` se guarda en la tabla `oauth_states` junto al `code_verifier` (TTL 10 min).
> Si en pruebas MP no devuelve `refresh_token`, agregar `scope=read write offline_access` a la URL de autorización.

---

## Paso 2 — Callback e Intercambio de Token

**Endpoint de Cocktrail**: `GET /api/mercadopago/oauth/callback?code=CODE&state=STATE`

El backend verifica el `state` (consume `oauth_states` — operación atómica) y llama:

**`POST https://api.mercadopago.com/oauth/token`**

```json
{
  "client_id": "{MP_APP_ID}",
  "client_secret": "{MP_CLIENT_SECRET}",
  "grant_type": "authorization_code",
  "code": "{CODE_DEL_CALLBACK}",
  "redirect_uri": "{MP_REDIRECT_URI}",
  "code_verifier": "{VERIFIER_GUARDADO_EN_OAUTH_STATES}"
}
```

### Response

```json
{
  "access_token": "APP_USR-...",
  "token_type": "bearer",
  "expires_in": 15552000,
  "refresh_token": "TG-...",
  "scope": "read write offline_access",
  "user_id": 446566691,
  "public_key": "APP_USR-..."
}
```

**Guardar en `mercadopago_sellers`**: `user_id`, `access_token`, `refresh_token`, `expires_at` (= `now + expires_in * 1000`).

---

## Paso 3 — Refresh Automático de Token

**Cuándo**: cuando `expires_at < now + 5min` (o 7 días de margen según la implementación).
**Validez del token**: ~180 días.

**`POST https://api.mercadopago.com/oauth/token`**

```json
{
  "client_id": "{MP_APP_ID}",
  "client_secret": "{MP_CLIENT_SECRET}",
  "grant_type": "refresh_token",
  "refresh_token": "{REFRESH_TOKEN_GUARDADO}"
}
```

> ⚠️ El `refresh_token` es **rotativo y de un solo uso**. Siempre persistir el nuevo `refresh_token` de la respuesta antes de usar el nuevo `access_token`. Si se pierde el nuevo token, la sesión queda invalidada.

### Error: `invalid_grant`
- El refresh token expiró o fue consumido
- Acción: marcar el seller como desconectado (`status = 'expired'`) y solicitar re-vinculación manual

---

## Tabla `oauth_states` (referencia de schema)

```sql
-- Ver supabase/migrations/20260715000400_oauth_states.sql
CREATE TABLE oauth_states (
  state         TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  bar_id        TEXT,                     -- Cocktrail-specific: contexto de la barra
  expires_at    TIMESTAMPTZ NOT NULL,     -- TTL 10 min
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RPC atómica (lee, valida TTL, elimina)
-- SECURITY DEFINER — solo service_role por REVOKE
CREATE FUNCTION consume_oauth_state(p_state TEXT)
RETURNS TABLE(code_verifier TEXT, bar_id TEXT);
```

---

## Tabla `mercadopago_sellers` (referencia de schema)

```sql
-- Ver supabase/migrations/20260715000100_mercadopago_sellers.sql
CREATE TABLE mercadopago_sellers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL UNIQUE,                      -- mp_user_id del vendedor
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,                      -- fecha de expiración real
  status        TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: solo service_role puede leer/escribir (tokens inaccesibles desde cliente)
```

---

## Variables de entorno necesarias

### Backend Express (`apps/api`) — escribe en Cloud

```env
# Cloud Supabase (oauth_states + mercadopago_sellers viven acá)
SUPABASE_CLOUD_URL=https://nmdvrmglmnbpoyfjmgab.supabase.co
SUPABASE_CLOUD_SERVICE_ROLE_KEY=...

# Credenciales de la app de MP
MP_APP_ID=...             # = client_id (APPID)
MP_CLIENT_SECRET=...
MP_REDIRECT_URI=https://nmdvrmglmnbpoyfjmgab.supabase.co/functions/v1/mp-auth-callback
```

### Edge Function — callback (`supabase/functions/mp-auth-callback`)

Estos secrets se configuran en el dashboard de Supabase Cloud o vía CLI:

```bash
supabase secrets set MP_APP_ID=...
supabase secrets set MP_CLIENT_SECRET=...
supabase secrets set MP_REDIRECT_URI=https://nmdvrmglmnbpoyfjmgab.supabase.co/functions/v1/mp-auth-callback
supabase secrets set NEXT_PUBLIC_SITE_URL=https://cocktrail.com
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son inyectados automáticamente por Supabase en la Edge Function (apuntan a Cloud).

---

## Buenas prácticas y anti-patrones

Ver [`api-oauth-best-practices.md`](./api-oauth-best-practices.md) — lista completa de anti-patrones (Authorization Bearer, state como business ID, hardcodeo de redirect_uri, PKCE code_verifier, etc.) y checklists de implementación para el inicio (URL de autorización) y el callback (intercambio de token).