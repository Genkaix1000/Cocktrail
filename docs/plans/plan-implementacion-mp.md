# Plan de Implementación — Integración MP

> **Punto de partida obligatorio**: ante cualquier tarea de MP, leer primero [`docs/mp/INDEX.md`](../mp/INDEX.md).  
> Este plan se basa en [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md).  
> Las Fases se ejecutan en orden secuencial (cada una depende de la anterior).

---

## Fase 0 — Schema de Base de Datos

### A) ¿Qué se hace?

Crear las migraciones de Supabase con las 3 tablas del modelo de datos definido en [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Modelo de datos (Cocktrail DB)" más la tabla `oauth_states` que requiere el flujo OAuth.

### B) ¿Por qué?

El spec define exactamente 3 tablas como modelo de datos de la integración: `mercadopago_sellers` guarda los tokens OAuth de cada vendedor (Bosko), `mercadopago_cajas` persiste el `store_id`, `external_pos_id` y la `qr_image` estática de cada barra, y `mercadopago_cajas_devices` vincula cada caja con su terminal Point física. Sin estas tablas, ninguna fase posterior puede persistir su estado. `oauth_states` es auxiliar para el flujo OAuth (PKCE), con TTL de 10 minutos y una RPC atómica `consume_oauth_state` que consume el state en un solo paso (lee, valida TTL, elimina). Actualmente existen directorios de migración vacíos (`supabase/migrations/20260715000*_*/`) que hay que poblar con el SQL correspondiente. [`docs/mp/api-oauth.md`](../mp/api-oauth.md) provee el schema exacto de `oauth_states` y `mercadopago_sellers`. [`docs/mp/api-stores-pos.md`](../mp/api-stores-pos.md) indica qué campos guardar del response de crear Store y POS (`store_id`, `qr.image`, `qr.template_document`, `external_id`).

### C) Migraciones

**C.1) `oauth_states`** — schema canónico en [`docs/mp/api-oauth.md`](../mp/api-oauth.md) § "Tabla oauth_states"

```sql
CREATE TABLE oauth_states (
  state         TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  bar_id        TEXT,                     -- Cocktrail-specific: saber qué barra inició el OAuth
  expires_at    TIMESTAMPTZ NOT NULL,     -- TTL 10 min
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RPC atómica: lee, valida TTL, elimina
-- SECURITY DEFINER para que funcione desde roles con acceso limitado a la tabla
CREATE FUNCTION consume_oauth_state(p_state TEXT)
RETURNS TABLE(code_verifier TEXT, bar_id TEXT) AS $$
BEGIN
  RETURN QUERY
  DELETE FROM oauth_states
  WHERE state = p_state AND expires_at > NOW()
  RETURNING code_verifier, bar_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Solo el backend puede ejecutar la RPC
REVOKE EXECUTE ON FUNCTION consume_oauth_state FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION consume_oauth_state TO service_role;
```

**C.2) `mercadopago_sellers`** — schema canónico en [`docs/mp/api-oauth.md`](../mp/api-oauth.md) § "Tabla mercadopago_sellers"

```sql
CREATE TABLE mercadopago_sellers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL UNIQUE,                      -- mp_user_id del vendedor (Bosko)
  access_token  TEXT NOT NULL,                             -- token OAuth activo
  refresh_token TEXT,                                      -- rotativo, un solo uso
  expires_at    TIMESTAMPTZ NOT NULL,                      -- fecha de expiración del token
  status        TEXT DEFAULT 'active'
                  CHECK (status IN ('active', 'expired')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()   -- se actualiza manualmente desde el backend en cada UPDATE
);
```

**C.3) `mercadopago_cajas`** — [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Modelo de datos" + [`docs/mp/api-stores-pos.md`](../mp/api-stores-pos.md) § "Crear Caja" (response: `id`, `qr.image`, `qr.template_document`)

```sql
CREATE TABLE mercadopago_cajas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id          UUID NOT NULL REFERENCES bars(id),      -- FK a la tabla de barras de Cocktrail
  store_id        TEXT NOT NULL,                          -- ID numérico de MP
  external_pos_id TEXT NOT NULL,                          -- "COCKTRAIL-BAR-01"
  pos_id_mp       TEXT,                                   -- ID que MP asignó al POS (response.id)
  qr_image        TEXT,                                   -- URL estática del QR (response.qr.image)
  qr_template     TEXT,                                   -- URL template PDF (response.qr.template_document)
  seller_user_id  TEXT NOT NULL REFERENCES mercadopago_sellers(user_id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Un mismo seller no puede tener dos cajas con el mismo external_pos_id
  CONSTRAINT uq_caja_seller_external UNIQUE (seller_user_id, external_pos_id),

  -- 1 barra = 1 PDV (modelo operativo)
  UNIQUE (bar_id)
);

-- Índice para listar PDVs por vendedor
CREATE INDEX idx_cajas_seller ON mercadopago_cajas(seller_user_id);
```

**C.4) `mercadopago_cajas_devices`** — [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Modelo de datos" + [`docs/mp/api-point-devices.md`](../mp/api-point-devices.md) § "Listar devices" (response: `id`, `operating_mode`)

```sql
CREATE TABLE mercadopago_cajas_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caja_id         UUID NOT NULL REFERENCES mercadopago_cajas(id),
  device_id       TEXT NOT NULL,                          -- "PAX_A910__SMART..."
  device_username TEXT,                                   -- alias del operador con la tablet
  operating_mode  TEXT DEFAULT 'PDV'   -- validar en app, no con CHECK (viene de la API de MP)

  -- Restricciones del modelo operativo
  CONSTRAINT uq_device_caja UNIQUE (caja_id),             -- 1 terminal por caja
  CONSTRAINT uq_device_id   UNIQUE (device_id)            -- 1 caja por terminal
);
```

**C.5) Seguridad (RLS)** — tokens en `mercadopago_sellers` deben ser inaccesibles desde el cliente

```sql
-- RLS: solo el backend (service_role) puede leer/escribir tokens
ALTER TABLE mercadopago_sellers ENABLE ROW LEVEL SECURITY;

-- Denegar acceso a roles que no son service_role
CREATE POLICY sellers_service_role_only
  ON mercadopago_sellers
  FOR ALL
  TO authenticated, anon
  USING (false);  -- bloquea todo desde cliente

-- El backend opera con service_role → bypassea RLS
-- No se necesita GRANT adicional: service_role ignora RLS por diseño en Supabase
```

**C.6) pgTAP** — tests de validación de schema, constraints y RPC

pgTAP se instala en la DB de desarrollo/local (no en producción). Si el proyecto no tiene pgTAP configurado, crear migración `20260715000600_pgtap_extension.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA public;
```

El test suite cubre: existencia de tablas/columnas, RPC `consume_oauth_state` (OK + expirado + doble consumo), constraints UNIQUE, FKs, y RLS en `mercadopago_sellers`. Se corre con `SELECT * FROM runtests();` y debe devolver `1..N` con todos los tests en verde.

> Nota: el fixture de `bars(id)` requiere una barra real de Cocktrail. Si `bars` tiene columnas `NOT NULL` adicionales, se necesita el INSERT completo con datos válidos. Usar una barra existente del seed local o crear una dummy en el test.

```sql
BEGIN;
SELECT plan(31);

-- ── 1) Existencia de tablas ──
SELECT has_table('public', 'oauth_states');
SELECT has_table('public', 'mercadopago_sellers');
SELECT has_table('public', 'mercadopago_cajas');
SELECT has_table('public', 'mercadopago_cajas_devices');

-- ── 2) Columnas clave ──
SELECT has_column('public', 'oauth_states', 'state');
SELECT has_column('public', 'oauth_states', 'code_verifier');
SELECT has_column('public', 'oauth_states', 'expires_at');

SELECT has_column('public', 'mercadopago_sellers', 'user_id');
SELECT has_column('public', 'mercadopago_sellers', 'access_token');
SELECT has_column('public', 'mercadopago_sellers', 'expires_at');
SELECT has_column('public', 'mercadopago_sellers', 'updated_at');

SELECT has_column('public', 'mercadopago_cajas', 'bar_id');
SELECT has_column('public', 'mercadopago_cajas', 'seller_user_id');
SELECT has_column('public', 'mercadopago_cajas', 'external_pos_id');

SELECT has_column('public', 'mercadopago_cajas_devices', 'caja_id');
SELECT has_column('public', 'mercadopago_cajas_devices', 'device_id');

-- ── 3) RPC existe ──
SELECT has_function('public', 'consume_oauth_state', ARRAY['text']);

-- ── 4) consume_oauth_state: OK (consume y borra) ──
INSERT INTO oauth_states (state, code_verifier, bar_id, expires_at)
VALUES ('st_ok', 'verifier_ok', 'BAR-01', now() + interval '10 minutes');

SELECT results_eq(
  $$ SELECT code_verifier, bar_id FROM consume_oauth_state('st_ok') $$,
  $$ VALUES ('verifier_ok'::text, 'BAR-01'::text) $$,
  'consume_oauth_state devuelve code_verifier y bar_id'
);

SELECT is(
  (SELECT count(*) FROM oauth_states WHERE state = 'st_ok')::int,
  0,
  'consume_oauth_state elimina el state'
);

-- ── 5) consume_oauth_state: expirado ──
INSERT INTO oauth_states (state, code_verifier, bar_id, expires_at)
VALUES ('st_exp', 'verifier_exp', NULL, now() - interval '1 minute');

SELECT is(
  (SELECT count(*) FROM consume_oauth_state('st_exp'))::int,
  0,
  'state expirado: no devuelve filas'
);

-- ── 6) consume_oauth_state: doble consumo ──
INSERT INTO oauth_states (state, code_verifier, bar_id, expires_at)
VALUES ('st_once', 'verifier_once', NULL, now() + interval '10 minutes');

SELECT lives_ok(
  $$ SELECT consume_oauth_state('st_once') $$,
  'primer consumo OK'
);

SELECT is(
  (SELECT count(*) FROM consume_oauth_state('st_once'))::int,
  0,
  'segundo consumo: no devuelve filas (state ya fue consumido)'
);

-- ── 7) Setup fixture para constraints y FKs ──
-- Ajustar con los campos NOT NULL reales de bars(id)
INSERT INTO bars (id) VALUES ('00000000-0000-0000-0000-000000000001');

INSERT INTO mercadopago_sellers (user_id, access_token, refresh_token, expires_at, status)
VALUES ('seller_1', 'at_1', 'rt_1', now() + interval '1 hour', 'active');

INSERT INTO mercadopago_cajas (id, bar_id, store_id, external_pos_id, seller_user_id)
VALUES ('00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000001',
        '123', 'BAR-01', 'seller_1');

-- ── 8) UNIQUE(seller_user_id, external_pos_id) ──
SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas (bar_id, store_id, external_pos_id, seller_user_id)
     VALUES ('00000000-0000-0000-0000-000000000001', '123', 'BAR-01', 'seller_1') $$,
  '23505',
  'uq_caja_seller_external: no permite duplicar para el mismo seller'
);

-- ── 9) UNIQUE(bar_id) ──
SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas (bar_id, store_id, external_pos_id, seller_user_id)
     VALUES ('00000000-0000-0000-0000-000000000001', '123', 'BAR-02', 'seller_1') $$,
  '23505',
  'UNIQUE(bar_id): no permite 2 cajas para la misma barra'
);

-- ── 10) Devices: UNIQUE(caja_id) ──
INSERT INTO mercadopago_cajas_devices (caja_id, device_id, operating_mode)
VALUES ('00000000-0000-0000-0000-000000000010', 'DEV_1', 'PDV');

SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas_devices (caja_id, device_id)
     VALUES ('00000000-0000-0000-0000-000000000010', 'DEV_2') $$,
  '23505',
  'UNIQUE(caja_id): no permite 2 terminals para la misma caja'
);

-- ── 11) Devices: UNIQUE(device_id) ──
SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas_devices (caja_id, device_id)
     VALUES ('00000000-0000-0000-0000-000000000010', 'DEV_1') $$,
  '23505',
  'UNIQUE(device_id): no permite reusar el mismo device_id'
);

-- ── 12) FK: bar_id inexistente ──
SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas (bar_id, store_id, external_pos_id, seller_user_id)
     VALUES ('00000000-0000-0000-0000-000000000099', '999', 'BAR-99', 'seller_1') $$,
  '23503',
  'FK bar_id: rechaza barra inexistente'
);

-- ── 13) FK: seller_user_id inexistente ──
SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas (bar_id, store_id, external_pos_id, seller_user_id)
     VALUES ('00000000-0000-0000-0000-000000000001', '123', 'BAR-03', 'seller_fake') $$,
  '23503',
  'FK seller_user_id: rechaza seller inexistente'
);

-- ── 14) FK: caja_id inexistente en devices ──
SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas_devices (caja_id, device_id)
     VALUES ('00000000-0000-0000-0000-000000000099', 'DEV_3') $$,
  '23503',
  'FK caja_id: rechaza caja inexistente'
);

-- ── 15) updated_at existe con default ──
SELECT ok(
  (SELECT updated_at FROM mercadopago_sellers WHERE user_id = 'seller_1') IS NOT NULL,
  'updated_at inicial existe con DEFAULT NOW()'
);
-- Nota: sin trigger, updated_at se actualiza desde el backend en cada UPDATE.
-- Si se decide agregar trigger más adelante, agregar test de actualización automática.

-- ── 16) RLS: cliente (anon) no puede leer mercadopago_sellers ──
SET LOCAL role anon;
SELECT throws_ok(
  $$ SELECT * FROM mercadopago_sellers $$,
  '42501',
  'RLS: anon no puede leer mercadopago_sellers'
);
RESET role;

-- ── 17) RLS: cliente (authenticated) no puede leer ──
SET LOCAL role authenticated;
SELECT throws_ok(
  $$ SELECT * FROM mercadopago_sellers $$,
  '42501',
  'RLS: authenticated no puede leer mercadopago_sellers'
);
RESET role;

SELECT * FROM finish();
ROLLBACK;
```

### D) Estado de validación — ✅ APROBADO (2026-07-17)

Migraciones creadas en `supabase/migrations/` (orden por dependencias de FK) y cableadas en `docker-compose.yml` (init-scripts `15..20`):

- `20260715000000_bars.sql` — tabla `bars` mínima (prerequisito de la FK `mercadopago_cajas.bar_id`)
- `20260715000100_mercadopago_sellers.sql` — sellers + RLS + grants
- `20260715000200_mercadopago_cajas.sql`
- `20260715000300_mercadopago_cajas_devices.sql`
- `20260715000400_oauth_states.sql` — tabla + RPC `consume_oauth_state` + permisos
- `20260715000600_pgtap_extension.sql` — solo dev/local

Test suite: `supabase/tests/phase0_schema_test.sql` — **32/32 en verde** (corrido en Postgres `supabase/postgres:17.6.1.136` sobre una DB aislada).

| # | Test | Estado |
|---|------|--------|
| 1–4 | Existencia de tablas (`oauth_states`, `mercadopago_sellers`, `mercadopago_cajas`, `mercadopago_cajas_devices`) | ✅ |
| 5–16 | Columnas clave de las 4 tablas | ✅ |
| 17 | RPC `consume_oauth_state(text)` existe | ✅ |
| 18–19 | `consume_oauth_state` OK: devuelve `code_verifier`+`bar_id` y elimina el state | ✅ |
| 20 | `consume_oauth_state` con state expirado: no devuelve filas | ✅ |
| 21–22 | `consume_oauth_state` doble consumo: primer OK, segundo vacío | ✅ |
| 23 | UNIQUE `(seller_user_id, external_pos_id)` (`23505`) | ✅ |
| 24 | UNIQUE `(bar_id)` (`23505`) | ✅ |
| 25 | Devices UNIQUE `(caja_id)` (`23505`) | ✅ |
| 26 | Devices UNIQUE `(device_id)` (`23505`) | ✅ |
| 27 | FK `bar_id` inexistente (`23503`) | ✅ |
| 28 | FK `seller_user_id` inexistente (`23503`) | ✅ |
| 29 | FK `caja_id` inexistente en devices (`23503`) | ✅ |
| 30 | `updated_at` con `DEFAULT NOW()` | ✅ |
| 31–32 | RLS: `anon` y `authenticated` no leen `mercadopago_sellers` (`42501`) | ✅ |

**Ajustes respecto al pseudo-SQL del plan** (documentados en el test):
- `plan(32)` en vez de `plan(31)`: el plan enumeraba 32 asserts.
- Firmas pgTAP corregidas: `has_table(schema, table, desc)`, `has_column(schema, table, column, desc)` y `throws_ok(sql, errcode, NULL, desc)` (el 3er arg de `throws_ok` es el mensaje esperado, no la descripción).
- Se agregó una segunda barra fixture (`…002`) para aislar el test de FK `seller_user_id` (con una sola barra ya usada, el INSERT chocaba primero con `UNIQUE(bar_id)`).
- **Decisión de diseño**: se creó una tabla `bars` mínima porque Cocktrail no tenía tabla de barras; `mercadopago_cajas.bar_id` la referencia como en el plan.
- **RLS + `REVOKE` (hallazgo)**: Supabase define DEFAULT PRIVILEGES que otorgan `ALL` a `anon`/`authenticated` en cada tabla nueva. Con solo RLS `USING(false)`, el cliente recibiría **0 filas sin error** (no `42501`). Para la denegación dura que exige el test/spec (tokens inaccesibles), la migración de `mercadopago_sellers` agrega `REVOKE ALL ... FROM anon, authenticated` además de la RLS (defensa en profundidad).
- La DB local compartida (`cocktrail-db`, database `postgres`) quedó **alineada con el plan**: se eliminaron las tablas MP legacy huérfanas (`mercadopago_ordenes`, `mercadopago_devices`, esquema viejo de `oauth_states`/`sellers`/`cajas`) y se aplicaron estas migraciones. Suite: 32/32 en verde también sobre esa DB.

- **Least-privilege extendido**: por los mismos DEFAULT PRIVILEGES, se aplicó `REVOKE ALL ... FROM anon, authenticated` también a `oauth_states`, `mercadopago_cajas` y `mercadopago_cajas_devices` (tablas de uso exclusivo del backend/service_role). Resultado: esas 4 tablas MP solo son accesibles por `postgres` + `service_role`. `bars` mantiene acceso estándar de la API (no es sensible).

---

## Fase 1 — OAuth (Vinculación de cuenta MP)

### A) ¿Qué se hace?

Implementar el flujo OAuth con PKCE para que Cocktrail obtenga un `access_token` + `refresh_token` de Bosko (el comercio) y los guarde en `mercadopago_sellers`, con refresh proactivo automático.

### B) ¿Por qué?

Es el Paso 1 del onboarding definido en [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Flujo completo de onboarding". Sin el token de Bosko no se puede crear sucursales, cajas ni cobros — todo recurso MP se crea "en nombre de" Bosko usando su token. El refresh proactivo (5–7 días antes del vencimiento) evita que una sesión activa se caiga en medio de un turno, y el `refresh_token` es rotativo y de un solo uso: si no se persiste el nuevo inmediatamente, la sesión queda invalidada (ver [`docs/mp/api-oauth.md`](../mp/api-oauth.md) § "Refresh Automático de Token").

### C) Implementación

**Docs**: [`docs/mp/api-oauth.md`](../mp/api-oauth.md)

**C.1) `GET /api/mercadopago/oauth/url?barId=BARRA-01`**

```
SERVICE: generateOAuthUrl(barId)
  code_verifier = crypto.randomBytes(32).toString('base64url')
  code_challenge = SHA256(code_verifier).toString('base64url')
  state = crypto.randomUUID()

  oauthStatesRepo.insert({ state, code_verifier, bar_id: barId, expires_at: NOW + 10min })

  url = "https://auth.mercadopago.com/authorization"
    + "?client_id=" + env.MP_APP_ID
    + "&response_type=code"
    + "&platform_id=mp"
    + "&state=" + state
    + "&redirect_uri=" + env.MP_REDIRECT_URI
    + "&scope=read write offline_access"     // ⚠ offline_access OBLIGATORIO
    + "&code_challenge=" + code_challenge
    + "&code_challenge_method=S256"

  RETURN { url }
```

**C.2) `GET /api/mercadopago/oauth/callback?code=...&state=...`**

```
SERVICE: handleOAuthCallback(code, state)
  result = oauthStatesRepo.consume(state)
  IF NOT result → 400 "state inválido/expirado"

  { code_verifier, bar_id } = result

  response = POST https://api.mercadopago.com/oauth/token
    BODY: {
      client_id:      env.MP_APP_ID,
      client_secret:  env.MP_CLIENT_SECRET,
      grant_type:     "authorization_code",
      code:           code,
      redirect_uri:   env.MP_REDIRECT_URI,
      code_verifier:  code_verifier
    }

  IF response.error → redirect /dashboard/pagos?error=oauth_failed

  sellersRepo.upsert({
    user_id:       response.user_id,
    access_token:  response.access_token,
    refresh_token: response.refresh_token,
    expires_at:    NOW() + (expires_in * INTERVAL '1 second'),
    status:        'active'
  })

  → redirect /dashboard/pagos?linked=true
```

**C.3) `refreshTokenIfNeeded(seller)`** — llamado antes de cualquier operación con token

```
SERVICE: refreshTokenIfNeeded(seller)
  // expires_at es TIMESTAMPTZ en DB → comparar con fecha, no ms
  IF seller.expires_at > NOW() + INTERVAL '7 days'
    RETURN seller.access_token  // faltan >7 días, no refrescar

  response = POST https://api.mercadopago.com/oauth/token
    BODY: {
      client_id:      env.MP_APP_ID,
      client_secret:  env.MP_CLIENT_SECRET,
      grant_type:     "refresh_token",
      refresh_token:  seller.refresh_token
    }

  IF response.error == "invalid_grant"
    sellersRepo.update(seller.user_id, { status: 'expired' })
    THROW "seller desconectado, re-vincular OAuth"

  // ⚠ PERSISTIR INMEDIATAMENTE — el refresh_token viejo queda invalidado
  sellersRepo.update(seller.user_id, {
    access_token:  response.access_token,
    refresh_token: response.refresh_token,  // NUEVO — rotativo, un solo uso
    expires_at:    NOW() + (expires_in * INTERVAL '1 second')
  })

  RETURN response.access_token
```

**C.4) UI**: botón "Vincular Mercado Pago" en `PagosSection.tsx` → redirige a la URL generada por C.1.

**Errores clave**:
- `invalid_grant` → el refresh token expiró o fue consumido. Marcar seller como `expired` y pedir re-vinculación manual.
- `offline_access` omitido en scope → MP no devuelve `refresh_token`. El scope es obligatorio.

---

## Fase 2 — Resolución Dinámica de Credenciales

### A) ¿Qué se hace?

Crear un servicio transversal `getAccessTokenForContext(opts)` que resuelva el `access_token` correcto según el contexto de la operación (device, barra, o fallback global).

### B) ¿Por qué?

El spec [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Resolución dinámica de credenciales" define 4 niveles de resolución. Hoy el código usa `env.MP_ACCESS_TOKEN` hardcodeado (single-seller, sin OAuth). Para soportar multi-seller y que cada barra/device use el token de su dueño, necesitamos esta capa antes de implementar QR o multi-seller. Sin esto, cualquier operación usaría siempre el token de un solo vendedor, rompiendo el modelo donde cada comercio (Bosko) tiene su propia cuenta.

### C) Implementación

**Archivo**: `apps/api/src/modules/mercadopago/credentials/credentials-resolver.service.ts`

```
SERVICE: getAccessTokenForContext(opts)
  opts: {
    deviceId?: string,           // X-Device-Id header
    barId?: string,              // X-Bar-Id header
    sellerUserId?: string,       // explícito
    allowGlobalFallback?: bool   // admin / provisioning
  }

  seller = NULL

  // 1. Resolver por device (Point/Posnet)
  IF opts.deviceId
    device = cajasDevicesRepo.findByDeviceId(opts.deviceId)
    IF device → seller = sellersRepo.findByUserId(device.caja.seller_user_id)

  // 2. Resolver por barra (QR cobro)
  IF seller IS NULL AND opts.barId
    caja = cajasRepo.findByBarId(opts.barId)
    IF caja → seller = sellersRepo.findByUserId(caja.seller_user_id)

  // 3. Resolver por sellerUserId explícito
  IF seller IS NULL AND opts.sellerUserId
    seller = sellersRepo.findByUserId(opts.sellerUserId)

  // 4. Fallback global (admin / provisioning / single-seller)
  IF seller IS NULL AND opts.allowGlobalFallback
    seller = sellersRepo.findFirstActive()

  // 5. Fallback legacy env vars (sandbox)
  IF seller IS NULL
    RETURN env.MP_ACCESS_TOKEN

  // Refrescar si está por vencer (Fase 1 — C.3)
  RETURN refreshTokenIfNeeded(seller)
```

**Middleware**: `mpAuthMiddleware()` — extrae `X-Device-Id` y `X-Bar-Id` de los headers y los mete en `req.mpContext`. Se monta en las rutas de MP sin reemplazar `authMiddleware`.

**Refactor pendiente**: `MercadoPagoService` (`mercadopago.service.ts`) debe migrar de `env.MP_ACCESS_TOKEN` a `getAccessTokenForContext()`. Las rutas existentes de Posnet (`/pos/intent`, `/device/status`, etc.) deben pasar `deviceId` desde el header.

---

## Fase 3 — Provisionamiento (Sucursal + Cajas)

### A) ¿Qué se hace?

Crear endpoints para: 1) crear una Store (sucursal) en la cuenta MP del vendedor, 2) crear un POS (caja) con su QR estático, y 3) vincular una terminal Point a una caja. Todo orquestado en un endpoint `/onboard`.

### B) ¿Por qué?

Es el Paso 2 del onboarding definido en [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Provisionamiento". Sin Store y POS no existe la caja en MP, y sin la caja no hay `external_pos_id` → no se puede crear una order QR después. El `location` de la Store es obligatorio y afecta cálculos fiscales (ver [`docs/mp/api-stores-pos.md`](../mp/api-stores-pos.md) § "Crear Sucursal"). El `fixed_amount: true` en el POS es obligatorio para integraciones programadas donde el vendedor controla el monto. El QR que devuelve MP al crear el POS es **estático e inmutable** — se guarda una vez y se imprime en la barra.

### C) Implementación

**Docs**: [`docs/mp/api-stores-pos.md`](../mp/api-stores-pos.md)

**C.1) `POST /api/mercadopago/provisioning/store`**

```
SERVICE: createStore(opts)
  seller = sellersRepo.findActive()
  token = refreshTokenIfNeeded(seller)

  external_id = "COCKTRAIL-SUC-{opts.barId}"

  response = POST https://api.mercadopago.com/users/{seller.user_id}/stores
    Authorization: Bearer {token}
    BODY: {
      name:        opts.name,
      external_id: external_id,
      location: {
        street_number: opts.address.streetNumber,
        street_name:   opts.address.streetName,
        city_name:     opts.address.city,       // ⚠ debe coincidir con catálogo MP
        state_name:    opts.address.state,       // ⚠ idem
        latitude:      opts.address.lat,
        longitude:     opts.address.lng,
        reference:     opts.address.reference
      }
    }

  RETURN { store_id: response.id }
```

**Errores clave**:
- `INVALID_LOCATION` (400) → `city_name` no coincide con el catálogo de ciudades del `state_name`. Usar exactamente los nombres del catálogo de Mercado Libre.
- `Forbidden` (403) → `user_id` del path no coincide con el dueño del token.

**C.2) `POST /api/mercadopago/provisioning/pos`**

```
SERVICE: createPos(opts)
  external_pos_id = "COCKTRAIL-BAR-{opts.barId}"
  token = getAccessTokenForContext({ barId: opts.barId, allowGlobalFallback: true })

  response = POST https://api.mercadopago.com/pos
    Authorization: Bearer {token}
    BODY: {
      name:              opts.posName,
      fixed_amount:      true,               // ⚠ OBLIGATORIO para integración programada
      store_id:          opts.storeId,
      external_store_id: "COCKTRAIL-SUC-{opts.barId}",
      external_id:       external_pos_id
    }

  // Guardar en DB — el QR es estático, no cambia
  cajasRepo.create({
    bar_id:          opts.barId,
    store_id:        opts.storeId,
    external_pos_id: external_pos_id,
    pos_id_mp:       response.id,
    qr_image:        response.qr.image,
    qr_template:     response.qr.template_document,
    seller_user_id:  seller.user_id
  })

  RETURN { pos_id: response.id, qr_image: response.qr.image, caja_id: cajaDb.id }
```

**C.3) `POST /api/mercadopago/provisioning/link-device`**

```
SERVICE: linkDeviceToCaja(opts)
  caja = cajasRepo.findById(opts.cajaId)

  // Verificar que el device existe y está activo en MP
  device = GET https://api.mercadopago.com/point/integration-api/devices/{opts.deviceId}
    Authorization: Bearer {token}

  cajasDevicesRepo.create({
    caja_id:         opts.cajaId,
    device_id:       opts.deviceId,
    device_username: opts.deviceUsername,
    operating_mode:  device.operating_mode
  })
```

**C.4) `POST /api/mercadopago/provisioning/onboard`** — orquestador

```
SERVICE: onboard(opts)
  seller = sellersRepo.findFirstActive()
  IF NOT seller → 409 "Vinculá una cuenta MP primero (Fase 1)"

  store  = createStore({ barId, name, address })
  pos    = createPos({ barId, storeId: store.store_id, posName })
  device = opts.deviceId ? linkDeviceToCaja({ cajaId: pos.caja_id, ... }) : NULL

  RETURN { store, pos, device }
```

---

## Fase 4 — Cobro con QR Estático (Orders API `type: "qr"`)

### A) ¿Qué se hace?

Implementar el cobro por QR usando la Orders API de MP con `type: "qr"` y `mode: "static"`. Re-agregar el botón "Código QR" en `/caja` (esta vez con implementación real).

### B) ¿Por qué?

Es el Paso 3a del spec [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Operación de cobro — QR estático". La decisión de diseño (ver [`docs/mp/INDEX.md`](../mp/INDEX.md) § "Decisiones de diseño clave") es usar el modelo estático: cada barra tiene su QR fijo impreso, y al crear una order ese QR se "carga" con el monto. El cliente siempre escanea el mismo QR. Esto es más simple que el modelo dinámico y no requiere generar una imagen nueva por cada cobro. El botón "Código QR" se sacó de `/caja` en la spec `cobro-posnet-mercadopago.md` porque no había implementación real — ahora que la hay, se re-agrega.

Esta fase introduce la tabla `mp_orders` (no incluida en el modelo de datos base de Fase 0 porque es específica al flujo de Orders API y no la requieren las fases de OAuth ni provisioning). [`docs/mp/api-orders-qr.md`](../mp/api-orders-qr.md) § "Response (modelo estático)" indica explícitamente: "Guardar `id` (order) y `transactions.payments[0].id` (pago) — necesarios para consultas y webhooks". La tabla persiste el `order_id_mp`, `payment_id_mp`, `external_reference` de Cocktrail, y el `status` de la order para el polling y la reconciliación por webhook (Fase 6).

### C) Implementación

**Docs**: [`docs/mp/api-orders-qr.md`](../mp/api-orders-qr.md)

**C.0) Migración: `mp_orders`** — necesaria para persistir el estado de las orders MP y poder hacer polling + reconciliación por webhook

```sql
CREATE TABLE mp_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id_mp     TEXT NOT NULL,        -- "ORD01K371..." (response.id)
  external_ref    TEXT NOT NULL,        -- "COCKTRAIL-ORDER-{ts}" (external_reference enviado)
  payment_id_mp   TEXT,                 -- "PAY01K371..." (transactions.payments[0].id)
  amount          NUMERIC(12,2) NOT NULL,
  status          TEXT NOT NULL,        -- created|processed|canceled|refunded
  type            TEXT NOT NULL,        -- 'qr' | 'point'
  bar_id          TEXT,
  caja_id         UUID REFERENCES mercadopago_cajas(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**C.1) `POST /api/mercadopago/orders/qr`** — crear order QR estática

```
SERVICE: createQrOrder(opts)
  token = getAccessTokenForContext({ barId: opts.barId })
  caja = cajasRepo.findByBarId(opts.barId)
  IF NOT caja → 409 "Barra sin caja MP configurada. Ejecutar Fase 3 primero."

  external_ref = "COCKTRAIL-{timestamp}-{random4}"
  amount_str = opts.amount.toFixed(2)

  response = POST https://api.mercadopago.com/v1/orders
    Authorization: Bearer {token}
    X-Idempotency-Key: {randomUUID()}
    BODY: {
      type:               "qr",
      external_reference: external_ref,
      total_amount:       amount_str,
      description:        opts.description,
      expiration_time:    "PT15M",
      config: {
        qr: {
          external_pos_id: caja.external_pos_id,  // ⚠ debe existir en MP (creado en Fase 3)
          mode:            "static"
        }
      },
      transactions: {
        payments: [{ amount: amount_str }]
      },
      items: [{
        title: "Consumo {caja.name}",
        unit_price: amount_str,
        quantity: 1,
        unit_measure: "unit"
      }]
    }

  mpOrdersRepo.create({
    order_id_mp:   response.id,
    external_ref:  external_ref,
    payment_id_mp: response.transactions.payments[0].id,
    amount:        amount_str,
    status:        "created",
    type:          "qr",
    bar_id:        opts.barId,
    caja_id:       caja.id
  })

  RETURN { orderId: response.id, qrImage: caja.qr_image, status: "created", expiresAt: NOW + 15min }
```

**Errores clave**:
- `pos_not_found` (400) → el `external_pos_id` no existe en MP. La caja no fue creada o el ID no coincide.
- `idempotency_key_already_used` (409) → la key ya se usó en las últimas 24h. Generar nueva UUID.

**C.2) `POST /api/mercadopago/orders/{orderId}/cancel`**

```
SERVICE: cancelQrOrder(orderId, barId)
  order = mpOrdersRepo.findByMpId(orderId)
  IF order.status != "created" → 409 "Solo cancelable en estado 'created'"

  POST https://api.mercadopago.com/v1/orders/{orderId}/cancel
    Authorization: Bearer {token}
    X-Idempotency-Key: {randomUUID()}

  mpOrdersRepo.updateStatus(orderId, "canceled")
```

**C.3) Frontend — `VentaSection.tsx` + `useCheckout.ts`**

Re-agregar botón "Código QR" en el selector de métodos de cobro (junto a Efectivo y Tarjeta). El flujo:

```
paymentMethod === "qr":
  1. mostrar estado "Esperando pago QR..."
  2. llamar POST /api/mercadopago/orders/qr { amount, barId }
  3. polling cada 3s → GET /api/mercadopago/orders/{orderId}/status
  4. status "processed" → concretar pedido (ordersService.create, paymentMethod: "qr")
  5. status "canceled" / "expired" → mostrar error, volver al selector
```

**Nota**: `"qr"` ya es un valor válido de `PaymentMethod` en `packages/shared/src/domain.ts` (usado por `/carta` y reportes de `/admin`). No se modifica el tipo compartido.

---

## Fase 5 — Cobro con Posnet/Point (Sin cambios funcionales)

### A) ¿Qué se hace?

Nada a nivel funcional. El sistema actual de payment-intents legacy sigue andando. Solo se refactoriza para usar `getAccessTokenForContext()` en lugar de `env.MP_ACCESS_TOKEN` (Fase 2).

### B) ¿Por qué?

El spec [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Decisiones tomadas" indica explícitamente: la Point API es un producto distinto para terminales físicas, y la migración a Orders API `type: "point"` ([`docs/mp/api-orders-point.md`](../mp/api-orders-point.md)) es deuda técnica futura. Migrar ahora rompería el único flujo de cobro que ya funciona en producción. [`docs/specs/cobro-posnet-mercadopago.md`](../specs/cobro-posnet-mercadopago.md) ya implementó el manejo de `CONFIRMATION_REQUIRED` y la limpieza del selector — eso no se toca.

### C) Endpoints existentes (sin cambios de contrato)

```
POST   /api/mercadopago/pos/intent          → [IMPLEMENTADO]
GET    /api/mercadopago/pos/intent/:id      → [IMPLEMENTADO]
DELETE /api/mercadopago/pos/intent/:id      → [IMPLEMENTADO]
GET    /api/mercadopago/device/status        → [IMPLEMENTADO]
POST   /api/mercadopago/device/test-charge   → [IMPLEMENTADO]
```

**Único cambio**: internamente usar `getAccessTokenForContext({ deviceId })` en vez de `env.MP_ACCESS_TOKEN`.

**Docs relevantes**:
- Sistema actual: [`docs/mp/api-point-devices.md`](../mp/api-point-devices.md)
- Resolución de `CONFIRMATION_REQUIRED`: [`docs/mp/api-payments.md`](../mp/api-payments.md)
- Migración futura: [`docs/mp/api-orders-point.md`](../mp/api-orders-point.md)

---

## Fase 6 — Webhooks (Conciliación Automática)

### A) ¿Qué se hace?

Exponer un endpoint público `POST /api/mercadopago/webhooks` que reciba notificaciones de MP (`merchant_order` / `payment`), valide el estado real contra la API de MP, e impacte el pedido en Cocktrail (completar o cancelar).

### B) ¿Por qué?

Es el Paso 4 del spec [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Conciliación". Sin webhooks, la única forma de saber si un QR se pagó es haciendo polling desde el frontend — frágil (el cajero cierra la pantalla, se pierde la conexión). Con webhooks, MP notifica al backend y el pedido se concreta aunque el frontend ya no esté escuchando. La validación contra la API de MP antes de impactar es obligatoria: nunca se debe confiar ciegamente en el body del webhook.

**Docs**: 
- [`docs/mp/api-orders-qr.md`](../mp/api-orders-qr.md) § "Estados de la order"
- [`docs/mp/api-payments.md`](../mp/api-payments.md) para `GET /v1/payments/{id}`

### C) Implementación

**C.1) `POST /api/mercadopago/webhooks`** — público, sin auth

```
SERVICE: handleWebhook(body)
  // body.topic puede ser "merchant_order" o "payment"

  IF body.topic == "merchant_order"
    orderId = body.resource.split("/").last()
    mpOrder = mpOrdersRepo.findByMpId(orderId)
    IF NOT mpOrder → 200 OK (ignorar, idempotente)

    // Validar contra API de MP — nunca confiar ciegamente en el webhook
    result = getOrderStatus(orderId, mpOrder.bar_id)
    CASE result.status OF
      "processed" → concretarPedido(mpOrder)
      "refunded"  → marcarReembolso(mpOrder)
      "canceled"  → cancelarPedido(mpOrder)

  IF body.topic == "payment"
    paymentId = body.resource.split("/").last()
    mpOrder = mpOrdersRepo.findByPaymentId(paymentId)
    IF NOT mpOrder → 200 OK

    payment = GET https://api.mercadopago.com/v1/payments/{paymentId}
    CASE payment.status OF
      "approved" → concretarPedido(mpOrder)
      "rejected" → cancelarPedido(mpOrder)

  RESPONSE → 200 OK (siempre — MP espera respuesta rápida)
```

**C.2) `concretarPedido(mpOrder)` / `cancelarPedido(mpOrder)`**

```
concretarPedido(mpOrder):
  order = ordersRepo.findByExternalRef(mpOrder.external_ref)
  IF order AND order.status == "pending"
    ordersRepo.update(order.id, {
      status:         "completed",
      payment_method: mpOrder.type == "qr" ? "qr" : "debito",
      mp_payment_id:  mpOrder.payment_id_mp
    })
    sseService.emit("order.completed", order)

cancelarPedido(mpOrder):
  order = ordersRepo.findByExternalRef(mpOrder.external_ref)
  IF order AND order.status == "pending"
    ordersRepo.update(order.id, { status: "cancelled" })
    sseService.emit("order.cancelled", order)
```

**Configuración en MP Dashboard**: el admin debe configurar la Webhook URL (`https://cocktrail.com/api/mp/webhooks`) y suscribirse a los eventos `merchant_order` y `payment`.

---

## Fase 7 — Reembolsos

### A) ¿Qué se hace?

Permitir reembolso total o parcial de una order (QR o Point) desde el panel de admin.

### B) ¿Por qué?

Cubre el caso de negocio donde un pedido ya fue pagado pero necesita devolverse (error en el monto, producto no disponible, etc.). La Orders API de MP soporta reembolso total (sin body) y parcial (con `transactions[].id` y `amount`). Los plazos difieren: QR tiene 180 días, Point tiene 90 días.

**Docs**: [`docs/mp/api-orders-qr.md`](../mp/api-orders-qr.md) § "Reembolso de una order QR"

### C) Implementación

**`POST /api/mercadopago/orders/{orderId}/refund`**

```
SERVICE: refundOrder(orderId, opts)
  token = getAccessTokenForContext({ barId: opts.barId })

  IF opts.amount IS NULL
    // Reembolso TOTAL — sin body
    response = POST https://api.mercadopago.com/v1/orders/{orderId}/refund
      Authorization: Bearer {token}
      X-Idempotency-Key: {randomUUID()}
  ELSE
    // Reembolso PARCIAL
    response = POST https://api.mercadopago.com/v1/orders/{orderId}/refund
      Authorization: Bearer {token}
      X-Idempotency-Key: {randomUUID()}
      BODY: { transactions: [{ id: paymentId, amount: opts.amount }] }

  mpOrdersRepo.updateStatus(orderId, response.status)
  RETURN response
```

**Plazos máximos**:
- QR order: 180 días desde el pago
- Point order: 90 días desde el pago

---

## Orden de Ejecución

| Fase | Qué | Depende de |
|------|-----|------------|
| Fase 0 | Schema DB | — |
| Fase 1 | OAuth | Fase 0 |
| Fase 2 | Credentials Resolver | Fase 1 |
| Fase 3 | Provisioning (Store + POS) | Fase 2 |
| Fase 4 | QR Estático | Fase 3 |
| Fase 5 | Posnet (refactor credenciales) | Fase 2 |
| Fase 6 | Webhooks | Fase 4 |
| Fase 7 | Reembolsos | Fase 4 |

## Decisiones respetadas del spec

| Decisión | Reflejo en el plan |
|----------|-------------------|
| `"qr"` permanece en `PaymentMethod` del dominio | No se toca `packages/shared/src/domain.ts` |
| QR estático con Orders API `type:"qr"` `mode:"static"` | Fase 4 — `POST /v1/orders` con `mode: "static"` |
| Point/Posnet legacy (payment-intents) no se migra | Fase 5 — sin cambios funcionales |
| `CONFIRMATION_REQUIRED` se resuelve automáticamente | Ya implementado — no se toca |
| 1 sucursal, 1 caja por barra, 1 terminal por caja | Modelo de datos y provisioning lo imponen |
| Refresh token rotativo y de un solo uso | Fase 1 — `refreshTokenIfNeeded` persiste el nuevo inmediatamente |
| Credenciales dinámicas por `barId`/`deviceId` | Fase 2 — prioridad: device → bar → global → env |
