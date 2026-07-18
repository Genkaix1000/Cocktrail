# Plan de Implementación — Integración MP

> ⚠ **Este archivo ya no es la fuente canónica.** El plan se desarmó en archivos individuales por fase para optimizar tokens.  
> **Ver [`docs/fases-mp/INDEX.md`](../fases-mp/INDEX.md)** — entrada única con orden de ejecución y enlaces a cada fase.
>
> El contenido legacy se mantiene abajo por referencia histórica.

---

## Fase 0 — Schema de Base de Datos

### A) ¿Qué se hace?

Crear las migraciones de Supabase con las 3 tablas del modelo de datos definido en [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Modelo de datos (Cocktrail DB)" más la tabla `oauth_states` que requiere el flujo OAuth.

**Dónde se aplican**: las migraciones corren en **ambos** Supabases (local Docker + Cloud), pero el flujo OAuth (Fase 1) usa exclusivamente **Cloud** para `oauth_states` y `mercadopago_sellers`. Las tablas `mercadopago_cajas` y `mercadopago_cajas_devices` (Fase 3) usan **Local**. Ver [arquitectura](#arquitectura-supabase-oauth-vs-operativo) al final de esta fase.

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

### Arquitectura Supabase: OAuth vs Operativo

```
┌─ OAuth (Fase 1) ─────────────────────────────┐
│  Express C.1  ──→ supabaseCloud ──→ Cloud     │
│  Edge Func C.2 ──→ supabaseAdmin ──→ Cloud    │
│  Tablas: oauth_states, mercadopago_sellers     │
└───────────────────────────────────────────────┘

┌─ Operativo (Fase 2–7) ───────────────────────┐
│  Express API ──→ supabase (local Docker)       │
│  Tablas: bars, mercadopago_cajas,              │
│          mercadopago_cajas_devices, orders...  │
│  Solo lectura de sellers desde Cloud para      │
│  resolver access_token (Fase 2)                │
└───────────────────────────────────────────────┘
```

**Por qué**: la Edge Function de callback se deploya en Supabase Cloud y solo puede hablar con Cloud. El resto del sistema (pedidos, productos, tickets) sigue offline-first en Local. Leer `mercadopago_sellers` de Cloud para resolver tokens (Fase 2) no agrega un nuevo punto de falla — el cobro con MP ya requiere internet para hablar con `api.mercadopago.com`.

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

**Docs**: [`docs/mp/api-oauth.md`](../mp/api-oauth.md) — flujo completo  
[`docs/mp/api-oauth-best-practices.md`](../mp/api-oauth-best-practices.md) — anti-patrones y checklists

**Arquitectura**: dos piezas separadas con responsabilidades distintas:

| Pieza | Dónde vive | Por qué |
|-------|-----------|---------|
| **Inicio** (`GET /oauth/url`) | Ruta Express en `apps/api` | Necesita `authMiddleware + requireRole("admin")` — solo admins inician OAuth. Usa `supabase` service_role (ya disponible en `shared/supabase.ts`). |
| **Callback** (`GET /oauth/callback`) | Edge Function en `supabase/functions/mp-auth-callback` | Endpoint público sin auth — lo llama el redirect de MP desde el navegador del vendedor. Usa `SUPABASE_SERVICE_ROLE_KEY` para bypasear RLS al escribir `mercadopago_sellers`. |

**C.1) Inicio — `GET /api/mercadopago/oauth/url?barId=...`** (Express)

Archivos a modificar:
- `apps/api/src/config/env.ts` — agregar `MP_APP_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI`
- `apps/api/src/modules/mercadopago/mercadopago.service.ts` — agregar `generateAuthUrl(barId)`
- `apps/api/src/modules/mercadopago/mercadopago.controller.ts` — agregar ruta

```ts
// ── mercadopago.service.ts ──
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { supabaseCloud } from "../../shared/supabase.js";

async generateAuthUrl(barId: string): Promise<{ url: string }> {
  const appId = env.MP_APP_ID;
  const redirectUri = env.MP_REDIRECT_URI;

  if (!appId || !redirectUri) {
    throw new Error("Configuración MP OAuth incompleta: faltan MP_APP_ID o MP_REDIRECT_URI");
  }

  // PKCE: code_verifier (43 chars) → code_challenge (S256)
  // ⚠ MP solo valida challenge si PKCE está habilitado en el panel de la app
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const state = randomUUID();

  const { error } = await supabaseCloud.from("oauth_states").insert({
    state,
    code_verifier: codeVerifier,
    bar_id: barId,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  if (error) {
    console.error("Error guardando oauth_state:", error);
    throw new Error("Error al iniciar el flujo OAuth");
  }

  // ⚠ redirect_uri debe ser estático y coincidir EXACTAMENTE con el configurado en la app de MP.
  // No se agregan query params extras (MP valida match exacto).
  const params = new URLSearchParams({
    client_id:              appId,
    response_type:          "code",
    platform_id:            "mp",
    state:                  state,
    redirect_uri:           redirectUri,
    code_challenge:         codeChallenge,
    code_challenge_method:  "S256",
  });

  // ⚠ scope no se incluye por defecto. La doc de Authorization Code de MP no
  // requiere scope explícito. Si en pruebas end-to-end MP no devuelve
  // refresh_token, agregar: scope: "read write offline_access"
  return { url: `https://auth.mercadopago.com/authorization?${params.toString()}` };
}

// ── mercadopago.controller.ts ──
router.get(
  "/oauth/url",
  authMiddleware,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const barId = req.query.barId;
      if (!barId || typeof barId !== "string") {
        res.status(400).json({ error: "barId es requerido (query param)" });
        return;
      }

      const { url } = await service.generateAuthUrl(barId);
      res.json({ url });
    } catch (err) {
      next(err);
    }
  }
);
```

**C.2) Callback — Edge Function `supabase/functions/mp-auth-callback/index.ts`**

Archivo a crear: `supabase/functions/mp-auth-callback/index.ts`  
Deploy: `supabase functions deploy mp-auth-callback`  
**Supabase**: la Edge Function corre en Cloud → `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` apuntan a Cloud. `oauth_states` y `mercadopago_sellers` deben existir en Cloud (las migraciones de Fase 0 se aplicaron en ambos).

```sql
-- ⚠ Ejecutar en AMBOS Supabases (Local + Cloud)
-- Vínculo bar↔seller (establecido al vincular OAuth)
ALTER TABLE bars ADD COLUMN IF NOT EXISTS seller_user_id TEXT;

-- Datos públicos de la cuenta MP (nombre, email, mostrados en UI)
ALTER TABLE mercadopago_sellers ADD COLUMN IF NOT EXISTS seller_nickname TEXT;
ALTER TABLE mercadopago_sellers ADD COLUMN IF NOT EXISTS seller_email TEXT;
```

**Nota**: `MP_APP_ID` en envs = `client_id` (APPID de la app de MP). Mantener el nombre de variable para consistencia con el resto del módulo, pero tener claro que en las llamadas a MP se usa como `client_id`. Ver [OAuth — Buenas Prácticas](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/credentials/oauth/best-practices) para la lista completa de chequeos.

```typescript
// supabase/functions/mp-auth-callback/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

serve(async (req: Request) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")

    if (!code || !state) {
      return new Response("Faltan code o state", { status: 400 })
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    // ── 1) Consumir state vía RPC atómica ──
    // state es un nonce aleatorio anti-CSRF, NO un business ID.
    const { data: oauthData, error: consumeError } =
      await supabaseAdmin.rpc("consume_oauth_state", { p_state: state })

    if (consumeError || !oauthData || oauthData.length === 0) {
      throw new Error("State inválido o expirado. Reiniciá la vinculación.")
    }

    const { code_verifier, bar_id } = oauthData[0]

    // ── 2) Intercambiar code por tokens ──
    // ⚠ Sin Authorization header. Autenticación: client_id + client_secret en body.
    const mpRedirectUri = Deno.env.get("MP_REDIRECT_URI")
    const mpClientId = Deno.env.get("MP_APP_ID")
    const mpClientSecret = Deno.env.get("MP_CLIENT_SECRET")

    if (!mpRedirectUri || !mpClientId || !mpClientSecret) {
      throw new Error("Configuración MP incompleta: faltan secrets")
    }

    const tokenResponse = await fetch(
      "https://api.mercadopago.com/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: mpClientId,
          client_secret: mpClientSecret,
          grant_type: "authorization_code",
          code: code,
          redirect_uri: mpRedirectUri,
          code_verifier: code_verifier,
        }),
      }
    )

    // ⚠ Verificar HTTP status además de tokenData.error
    // (captura casos donde MP no devuelve JSON válido)
    if (!tokenResponse.ok) {
      const body = await tokenResponse.text()
      console.error("MP /oauth/token HTTP error:", tokenResponse.status, body)
      throw new Error(`Error HTTP ${tokenResponse.status} al obtener tokens`)
    }

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      console.error("MP /oauth/token error:", tokenData)
      throw new Error(tokenData.message || "Error al obtener tokens de Mercado Pago")
    }

    // ── 3) Persistir en mercadopago_sellers ──
    // Si expires_in no viene → NOW() para forzar refresh inmediato
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : new Date().toISOString()

    const { error: dbError } = await supabaseAdmin
      .from("mercadopago_sellers")
      .upsert(
        {
          user_id: String(tokenData.user_id),
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token ?? null,
          expires_at: expiresAt,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )

    if (dbError) throw dbError

    // ── 3b) Vincular bar_id ↔ seller ──
    if (bar_id) {
      await supabaseAdmin
        .from("bars")
        .update({ seller_user_id: String(tokenData.user_id) })
        .eq("id", bar_id)
    }

    // ── 3c) Obtener y persistir datos públicos de la cuenta ──
    // GET /users/me con el access_token recién obtenido
    const userResponse = await fetch(
      "https://api.mercadopago.com/users/me",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    )
    if (userResponse.ok) {
      const userData = await userResponse.json()
      await supabaseAdmin
        .from("mercadopago_sellers")
        .update({
          seller_nickname: userData.nickname ?? null,
          seller_email:    userData.email ?? null,
        })
        .eq("user_id", String(tokenData.user_id))
    }
    // Si falla GET /users/me, no es crítico — los tokens ya están guardados

    // ── 4) Redirect al frontend con bar_id ──
    const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000"
    const params = new URLSearchParams({ linked: "true" })
    if (bar_id) params.set("barId", bar_id)

    return Response.redirect(`${siteUrl}/admin?tab=pagos&${params.toString()}`, 302)
  } catch (error: any) {
    console.error("mp-auth-callback error:", error.message)
    const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000"
    return Response.redirect(
      `${siteUrl}/admin?tab=pagos&linked=false&message=${encodeURIComponent(error.message)}`,
      302
    )
  }
})
```

**Secrets en Supabase** (obligatorios para la Edge Function):

```bash
supabase secrets set MP_APP_ID=...
supabase secrets set MP_CLIENT_SECRET=...
supabase secrets set MP_REDIRECT_URI=https://<proyecto>.supabase.co/functions/v1/mp-auth-callback
supabase secrets set NEXT_PUBLIC_SITE_URL=https://cocktrail.com
```

**Anti-patrones evitados** (ver [`api-oauth-best-practices.md`](../mp/api-oauth-best-practices.md) para lista completa):

| Anti-patrón | Cómo se evita |
|---|---|
| `state` usado como business ID | `randomUUID()` → `bar_id` guardado en `oauth_states`, recuperado vía RPC |
| `Authorization: Bearer` en `/oauth/token` | Solo `client_id` + `client_secret` en body |
| `redirect_uri` hardcodeado | `Deno.env.get("MP_REDIRECT_URI")` en ambos lados |
| `code_verifier` ausente (sin PKCE) | Generado en C.1, recuperado de `oauth_states` en callback |
| Guardar `public_key` u otros campos no canónicos | Solo `access_token`, `refresh_token`, `user_id`, `expires_at` |
| CORS innecesario en callback | Callback es redirect de navegador, no XHR — sin CORS |
| `expires_in` ausente = default enorme | Si no viene → `NOW()` → fuerza refresh inmediato |

**C.3) `refreshTokenIfNeeded(seller)`** — llamado antes de cualquier operación con token

**Docs**: [`docs/mp/api-oauth.md`](../mp/api-oauth.md) § "Paso 3 — Refresh Automático de Token"  
[`docs/mp/api-oauth-best-practices.md`](../mp/api-oauth-best-practices.md) § "Anti-patrones"

**⚠ Concurrencia**: el refresh_token es rotativo y de un solo uso. Dos requests concurrentes refrescando el mismo seller pueden "quemar" el token nuevo: el primero refresca y persiste el nuevo, el segundo usa el viejo (ya invalidado) y recibe `invalid_grant`. Solución: lock por seller con `SELECT ... FOR UPDATE`.

```
SERVICE: refreshTokenIfNeeded(seller)

  // ── 1) Lock y re-chequeo dentro de transacción ──
  BEGIN TRANSACTION

  // Bloquea el row del seller para evitar refresh concurrente
  seller = SELECT * FROM mercadopago_sellers
    WHERE user_id = seller.user_id
    FOR UPDATE

  // expires_at es TIMESTAMPTZ en DB → comparar con fecha, no ms
  // Margen configurable (entre 1 y 7 días, default 5)
  refreshMargin = env.MP_REFRESH_MARGIN_DAYS ?? 5  // días antes del vencimiento
  IF seller.expires_at > NOW() + (refreshMargin * INTERVAL '1 day')
    COMMIT
    RETURN seller.access_token  // todavía no hace falta refrescar

  // ── 2) Refrescar token ──
  response = POST https://api.mercadopago.com/oauth/token
    HEADERS: Content-Type: application/x-www-form-urlencoded
    // ⚠ Sin Authorization header
    // ⚠ Sin redirect_uri (solo para authorization_code, no para refresh_token)
    BODY: {
      client_id:      env.MP_APP_ID,
      client_secret:  env.MP_CLIENT_SECRET,
      grant_type:     "refresh_token",
      refresh_token:  seller.refresh_token
    }

  IF NOT response.ok → THROW "Error HTTP al refrescar token"
  IF response.error == "invalid_grant"
    sellersRepo.update(seller.user_id, { status: 'expired' })
    COMMIT
    THROW "seller desconectado, re-vincular OAuth"

  // ── 3) Persistir nuevo token y commit ──
  // ⚠ PERSISTIR INMEDIATAMENTE — el refresh_token viejo queda invalidado
  sellersRepo.update(seller.user_id, {
    access_token:  response.access_token,
    refresh_token: response.refresh_token,  // NUEVO — rotativo, un solo uso
    expires_at:    NOW() + (response.expires_in * INTERVAL '1 second')
  })

  COMMIT
  RETURN response.access_token
```

**Notas**:
- `redirect_uri` **no** se envía en el refresh (la doc de MP lo usa solo para `authorization_code`).
- Si MP no devuelve `refresh_token`, el sistema tolera `NULL` — el seller quedará sin refresh y eventualmente expirará, forzando re-vinculación.
- El `FOR UPDATE` dentro de una transacción serializa los refreshes: si dos requests llegan al mismo tiempo, el segundo espera al COMMIT del primero y re-chequea `expires_at` (ya actualizado).

**C.4) UI** — botón "Vincular Mercado Pago" en `PagosSection.tsx`

El botón muestra:
- **Label**: "Vincular Mercado Pago" (o "Actualizar vinculación" si ya está vinculado)
- **Icono**: logo minimalista de Mercado Pago (`<img>` o SVG inline, 20×20px, alineado a la izquierda del texto)
- **Info de cuenta** (si ya vinculada): debajo del botón, un badge sutil con:
  - `seller_nickname` (ej. "BOSKO BAR")
  - `seller_email`
  - `updated_at` con formato relativo ("Vinculado hace 3 días")

Comportamiento:
- Si `mercadopago_sellers` está vacío → botón "Vincular Mercado Pago" → `GET /api/mercadopago/oauth/url?barId=...` → `window.location.href = url`
- Si existe un seller `active` → el botón cambia a "Actualizar vinculación" + muestra badge con datos de cuenta
- Si existe un seller `expired` → el botón muestra "Re-vincular Mercado Pago" en rojo/naranja + badge "Sesión expirada"

Datos que necesita el frontend: un endpoint `GET /api/mercadopago/seller-status?barId=...` que lea de `supabaseCloud` (no de local — los sellers viven en Cloud):

```json
{
  "linked": true,
  "status": "active",
  "nickname": "BOSKO BAR",
  "email": "bosko@example.com",
  "linkedAt": "2026-07-15T22:14:00Z"
}
```

**Errores clave**:
- `invalid_grant` → el refresh token expiró o fue consumido (incluye caso de concurrencia: dos refreshes simultáneos). Marcar seller como `expired` y pedir re-vinculación manual. El `FOR UPDATE` previene la mayoría de estos casos.
- MP no devuelve `refresh_token` → revisar scopes/config en la app de MP. El sistema ya tolera `refresh_token` nulo (el seller queda sin capacidad de refresh y eventualmente expira).
- `redirect_uri` no coincide → MP rechaza el canje. Asegurar que `MP_REDIRECT_URI` en secrets coincida exactamente con la URL de redireccionamiento configurada en la app de MP. No se envía en refresh (solo en `authorization_code`).
- PKCE no habilitado en la app de MP → `code_verifier` se ignora silenciosamente. Verificar en panel de MP > tu app > PKCE.
- "Aplicación no está lista" / "La aplicación no puede conectarse a tu cuenta" → error pre-callback. Ver [`api-oauth-best-practices.md#troubleshooting`](../mp/api-oauth-best-practices.md#troubleshooting-aplicación-no-está-lista--la-aplicación-no-puede-conectarse-a-tu-cuenta): redirect_uri mismatch, app inactiva, o client_id incorrecto.

**C.5) Tests** — por capa

### Unit tests (`generateAuthUrl` service)

Mock: `supabaseCloud.from("oauth_states").insert` exitoso.

```
1) state es único entre llamadas consecutivas (dos URLs generadas tienen state distinto)
2) code_verifier cumple longitud entre 43 y 128 caracteres, solo caracteres base64url
3) code_challenge = SHA256(code_verifier).digest("base64url")
4) code_challenge_method = "S256" en la URL
5) La URL contiene client_id, response_type=code, redirect_uri, state, code_challenge, code_challenge_method
6) El insert a oauth_states lleva expires_at ≈ NOW + 10 min (margen ±1s)
7) Si MP_APP_ID o MP_REDIRECT_URI no están definidos → throw
```

### pgTAP (DB/RPC) — se agregan a la suite existente de Fase 0

```
8)  consume_oauth_state: primer consumo devuelve datos, segundo no devuelve nada
9)  consume_oauth_state: state expirado no se consume (no devuelve filas)
10) consume_oauth_state: en concurrencia simulada, solo una sesión obtiene datos
     -- Se usa pg_try_advisory_lock para simular dos sesiones compitiendo
```

### Integration tests (Edge Function callback) — `fetch` mockeado

```
11) Caso OK: POST /oauth/token → 200 { access_token, refresh_token, user_id, expires_in }
    → verifica upsert en mercadopago_sellers con status='active'
    → GET /users/me → 200 { nickname, email } → verifica update de seller_nickname, seller_email
    → redirect a /admin?tab=pagos&linked=true&barId=...

12) Caso error MP: POST /oauth/token → 400 { error: "invalid_grant", message: "..." }
    → redirect a /admin?tab=pagos&linked=false&message=...
    → NO persiste seller

13) Caso state inválido/expirado: consume_oauth_state → []
    → redirect /admin?tab=pagos&linked=false&message=State%20inv%C3%A1lido...

14) Caso GET /users/me falla: token guardado, account info no → redirect OK
    (la obtención de datos de cuenta no es crítica)

15) Caso sin code o state en query params → 400
```

### Integration tests (refresh token)

```
16) expires_at > NOW + umbral → no llama a /oauth/token, devuelve token actual
17) expires_at < NOW + umbral → llama refresh, persiste nuevo access_token + refresh_token
18) /oauth/token devuelve invalid_grant → marca status='expired', throw
19) Concurrencia: dos llamadas simultáneas al refresh del mismo seller
    → FOR UPDATE serializa: la segunda espera, re-chequea expires_at (ya actualizado),
      y reutiliza el token sin hacer segunda llamada a MP
```

### Tests de seguridad

```
20) RLS mercadopago_sellers: SET LOCAL role anon → SELECT → blocked
21) RLS mercadopago_sellers: SET LOCAL role authenticated → SELECT → blocked
22) GET /api/mercadopago/oauth/url sin auth → 401
23) GET /api/mercadopago/oauth/url con rol caja → 403 (solo admin)
24) Callback redirect no expone access_token ni refresh_token en la URL
    (solo flags: linked=true/false, barId, message)
25) Callback no acepta POST con body arbitrario para crear sellers
    (solo procesa code+state de query params, y el state se consume una sola vez)
```

### D) Estado de validación — ✅ APROBADO (local) / ⏳ PENDIENTE (cloud) (2026-07-17)

**Implementación** (flujo cloud, decidido con el usuario):
- `apps/api/src/modules/mercadopago/mercadopago-oauth.service.ts` — `generateAuthUrl` (PKCE S256, sin `scope` por defecto, redirect_uri estático), `refreshTokenIfNeeded` (form-urlencoded, sin `Authorization`, sin `redirect_uri`, margen `MP_REFRESH_MARGIN_DAYS` default 5, `invalid_grant`→`expired`) y `getSellerStatus`.
- Repos `oauth-states.repository.ts` + `mercadopago-sellers.repository.ts` usan `mpDb = supabaseCloud ?? supabase` (escriben en Cloud en prod; en dev caen a la DB local que tiene las mismas tablas).
- `mercadopago-oauth.controller.ts` — `GET /api/mercadopago/oauth/url` (admin, barId requerido) + `GET /api/mercadopago/seller-status` (admin). Wireado en `app.ts`.
- **Callback = Edge Function** `supabase/functions/mp-auth-callback/index.ts` (nombre alineado a la función ya deployada del usuario): consume state → canjea token (x-www-form-urlencoded) → upsert seller → `/users/me` (nickname/email) → link `bars.seller_user_id` (best-effort) → redirect a **`/admin?tab=pagos`** con `linked=true|false[&message]`.
- Migración `20260715000500_mp_oauth_cloud_columns.sql` — `bars.seller_user_id`, `mercadopago_sellers.seller_nickname/seller_email` (cableada en `docker-compose.yml`, aplicada a la DB local).
- Env: `MP_APP_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI`, `MP_REFRESH_MARGIN_DAYS` (+ `.env.example`).
- UI: `PagosSection.tsx` — botón Vincular/Actualizar/Re-vincular según `seller-status`, badge (nickname/email/"vinculado hace N días"), manejo de `?linked&message`.

Archivos de test creados:
- `apps/api/src/modules/mercadopago/mercadopago-oauth.service.test.ts` — unit C.5 #1–7 + refresh #16–18 + `getSellerStatus`.
- `apps/web/src/components/settings/PagosSection.test.tsx` — UI (botón, estados, callback `linked`/`message`).
- `supabase/tests/phase1_oauth_rpc_test.sql` — pgTAP C.5 #8–10.

| # | Test | Estado |
|---|------|--------|
| 1–7 | Unit `generateAuthUrl` (state único, verifier 43–128 base64url, challenge S256, params, sin scope, TTL 10 min, throw sin config) | ✅ (7/7) |
| 8–10 | pgTAP `consume_oauth_state` (primer consumo, one-shot, expirado no consume) | ✅ (4/4) |
| 16–18 | Unit refresh token (umbral 5d, form-urlencoded sin redirect_uri, `invalid_grant`→expired, otro error) | ✅ |
| — | UI PagosSection (Vincular/Actualizar/Re-vincular, badge, callback params) | ✅ (backend 218/218 · web 15/15 · tsc API+web OK) |
| 11–15 | Integration callback (Edge Function Deno) | ⏳ Cloud — función `mp-auth-callback` **deployada** (v2, `verify_jwt=false`) en el proyecto Bosko; falta E2E con credenciales MP reales |
| 19 | Refresh concurrencia `FOR UPDATE` | ⚠ No aplicable con supabase-js/PostgREST (sin pool pg no se puede sostener el lock a través del fetch a MP). Documentado en el service; refresh sin lock (ventana de carrera mínima) |
| 20–21 | RLS sellers `anon`/`authenticated` | ✅ ya cubierto en Fase 0 (phase0_schema_test #31–32) |
| 22–23 | Auth `/oauth/url` (401 sin sesión, 403 rol caja) | ✅ por `authMiddleware + requireRole("admin")` (middleware ya testeado) — ⏳ falta integration e2e dedicado |
| 24–25 | Callback no expone tokens en URL / solo procesa code+state, state one-shot | ✅ por diseño (redirect solo con `linked/message/barId`; state consumido vía RPC) |

**Provisión cloud — ✅ HECHO (2026-07-17, proyecto Bosko `nmdvrmglmnbpoyfjmgab`)**:
- Migraciones aplicadas: Fase 0 (`bars`, `mercadopago_sellers`+RLS, `mercadopago_cajas`, `mercadopago_cajas_devices`, `oauth_states`+RPC) + Fase 1 (`20260715000500` columnas). Verificado: 5 tablas MP + columnas + RPC.
- Edge Function `mp-auth-callback` **deployada v2** con `verify_jwt=false` (callback público; CSRF = state one-shot).
- RPC `consume_oauth_state` endurecida (search_path fijo + `REVOKE EXECUTE FROM anon, authenticated`) → advisors de seguridad MP en verde (solo queda un WARN preexistente en `rls_auto_enable`, ajeno a MP).
- Probe E2E de la RPC en cloud: insert + consume OK + segundo consumo vacío (one-shot).

**Pendiente (acción del usuario, requiere credenciales que no tengo)**:
1. **Secrets de la Edge Function** (no hay tool MCP para setearlos): `supabase secrets set MP_APP_ID=... MP_CLIENT_SECRET=... MP_REDIRECT_URI=https://nmdvrmglmnbpoyfjmgab.supabase.co/functions/v1/mp-auth-callback NEXT_PUBLIC_SITE_URL=<url_del_frontend>`.
2. **Backend** (`apps/api/.env`): `SUPABASE_CLOUD_URL` + `SUPABASE_CLOUD_SERVICE_ROLE_KEY` (para que `generateAuthUrl` escriba el state en el mismo proyecto), y `MP_APP_ID` / `MP_CLIENT_SECRET` / `MP_REDIRECT_URI` (mismo redirect_uri exacto).
3. **Panel de MP**: registrar ese `redirect_uri` exacto en "Tus integraciones" y habilitar PKCE.
4. E2E real de vinculación (11–15) una vez cargadas las credenciales.

---

---

## Fase 2 — Resolución Dinámica de Credenciales

### A) ¿Qué se hace?

Crear un servicio `CredentialsResolverService` que obtenga un `access_token` válido del único vendedor vinculado (single-seller), refrescándolo proactivamente si está por vencer. El `MercadoPagoService` existente (Posnet) se refactoriza para usar este resolver en vez de `env.MP_ACCESS_TOKEN` directo.

### B) ¿Por qué?

El modelo operativo de Cocktrail es **single-seller**: un solo comercio (Bosko) recibe todo el dinero, independientemente de cuántas barras o cajeras operen. No hay multi-seller. Hoy el código usa `env.MP_ACCESS_TOKEN` hardcodeado — con OAuth (Fase 1), el token vive en `mercadopago_sellers` (Cloud) y debe refrescarse proactivamente. El resolver abstrae esa complejidad para que el resto del módulo MP (Posnet, futuro QR) solo pida `credentialsResolver.resolve()` y reciba un token listo.

**Cloud vs Local**: `mercadopago_sellers` vive en Cloud (escrito por el callback OAuth). El resolver usa `mpDb` (cloud-first, ver `shared/supabase.ts`). Si Cloud no está disponible, `mpDb` cae a `supabase` local y, si tampoco hay sellers ahí, al fallback `env.MP_ACCESS_TOKEN` (legacy, solo si `allowGlobalFallback=true`).

### C) Implementación

**C.1) `CredentialsResolverService`**

**Archivo**: `apps/api/src/modules/mercadopago/credentials-resolver.service.ts`

```ts
import { env } from "../../config/env.js";
import type { MercadoPagoSellersRepository, Seller } from "../mercadopago-sellers.repository.js";
import type { MercadoPagoOAuthService } from "../mercadopago-oauth.service.js";

export type CredentialContext = {
  sellerUserId?: string;
  allowGlobalFallback?: boolean;
};

export class CredentialsResolverService {
  constructor(
    private readonly sellersRepo: MercadoPagoSellersRepository,
    private readonly oauthService: MercadoPagoOAuthService,
  ) {}

  async resolve(context: CredentialContext = {}): Promise<string> {
    let seller: Seller | null = null;

    // 1. sellerUserId explícito (admin/provisioning — prioridad máxima)
    if (context.sellerUserId) {
      seller = await this.sellersRepo.findByUserId(context.sellerUserId);
    }

    // 2. Seller activo por defecto (único vendedor vinculado vía OAuth)
    if (!seller) {
      seller = await this.sellersRepo.findFirstActive();
    }

    // 3. Fallback legacy env vars — solo si allowGlobalFallback
    if (!seller) {
      if (context.allowGlobalFallback && env.MP_ACCESS_TOKEN) {
        return env.MP_ACCESS_TOKEN;
      }
      throw new Error(
        "No hay ninguna cuenta de Mercado Pago vinculada. " +
        "Vinculala desde /admin?tab=pagos."
      );
    }

    // Validar que el seller esté activo antes de refrescar
    if (seller.status !== "active") {
      throw new Error(
        `La cuenta de Mercado Pago (${seller.userId}) está desconectada. ` +
        "Volvé a vincularla desde /admin?tab=pagos."
      );
    }

    // Validar que tenga refresh_token para refrescar proactivamente
    if (!seller.refreshToken) {
      throw new Error(
        `La cuenta de Mercado Pago (${seller.userId}) no tiene refresh_token. ` +
        "Volvé a vincularla para obtener uno nuevo."
      );
    }

    // Refrescar si está por vencer (Fase 1 — C.3).
    // ⚠ Concurrencia: refreshTokenIfNeeded debe usar lock por seller
    // (advisory lock o row lock) porque el refresh_token es de un solo uso.
    return this.oauthService.refreshTokenIfNeeded(seller);
  }
}
```

**Wiring en `app.ts`**:

```ts
const credentialsResolver = new CredentialsResolverService(mpSellersRepo, mpOAuthService);
```

**C.2) Refactor de `MercadoPagoService` (Posnet legacy)**

El servicio Posnet debe migrar de `env.MP_ACCESS_TOKEN` al resolver. Cambios puntuales:

| Qué cambia | Cómo |
|---|---|
| Constructor | Recibe `CredentialsResolverService` como dependencia |
| `assertConfigured(requireDevice)` | Deja de leer `env.MP_ACCESS_TOKEN`. Solo valida `env.MP_POS_DEVICE_ID` si `requireDevice=true` |
| `pointApiRequest(token, path, init, errorMsg)` | Cambia firma: recibe `token: string` como primer parámetro. Header `Authorization: Bearer {token}` en vez de `Bearer ${env.MP_ACCESS_TOKEN}` |
| `checkDeviceConnection()` | Llama a `credentialsResolver.resolve({ allowGlobalFallback: true })` antes de hacer el fetch. Usa el token resuelto en `Authorization` |
| `createPaymentIntent(amount, desc)` | Llama a `credentialsResolver.resolve({ allowGlobalFallback: true })` antes de `pointApiRequest` |
| `getPaymentIntentStatus(id)` | Ídem |
| `cancelPaymentIntent(id)` | Ídem |
| `testDeviceReachability()` | Ídem |

Ejemplo del cambio en `createPaymentIntent`:

```ts
// Antes:
async createPaymentIntent(amount: number, description?: string) {
  this.assertConfigured();
  const response = await this.pointApiRequest<MpPaymentIntentResponse>(
    `/point/integration-api/devices/${env.MP_POS_DEVICE_ID}/payment-intents`,
    { method: "POST", body: JSON.stringify({ amount, ... }) },
    "Error al crear intención de cobro"
  );
}

// Después:
async createPaymentIntent(amount: number, description?: string) {
  this.assertConfigured();
  const token = await this.credentialsResolver.resolve({ allowGlobalFallback: true });
  const response = await this.pointApiRequest<MpPaymentIntentResponse>(
    token,
    `/point/integration-api/devices/${env.MP_POS_DEVICE_ID}/payment-intents`,
    { method: "POST", body: JSON.stringify({ amount, ... }) },
    "Error al crear intención de cobro"
  );
}
```

**C.3) Middleware `mpContextMiddleware`**

**Archivo**: `apps/api/src/modules/mercadopago/mp-context.middleware.ts`

En modo single-seller no hay headers `X-Device-Id`/`X-Bar-Id` que extraer. El middleware existe para documentar el patrón y extender `Express.Request` con `mpContext`, dejando preparada la infraestructura por si en el futuro se agregan headers contextuales.

```ts
declare global {
  namespace Express {
    interface Request {
      mpContext?: CredentialContext;
    }
  }
}

// Se monta después de authMiddleware + requireRole.
export function mpContextMiddleware(_req: Request, _res: Response, next: NextFunction) {
  next();
}
```

En el controller, el patrón queda preparado:

```ts
router.post("/pos/intent", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
  const intent = await service.createPaymentIntent(amount, description);
  res.json(intent);
});
```

## Fase 3 — Provisionamiento (Sucursal + Cajas + UI)

### A) ¿Qué se hace?

Backend: crear endpoints para gestionar la Store (sucursal), cajas/POS con QR estático, y vinculación de terminals Point/Posnet. Frontend: un panel "PDV" en `/admin?tab=pdv` que muestra el estado de la sucursal y permite administrar cajas y Posnets con un grid CRUD siguiendo el patrón de `CartaSection`.

### B) ¿Por qué?

Es el Paso 2 del onboarding definido en [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Provisionamiento". Sin Store y POS no existe la caja en MP, y sin la caja no hay `external_pos_id` → no se puede crear una order QR después. El `location` de la Store es obligatorio y afecta cálculos fiscales (ver [`docs/mp/api-stores-pos.md`](../mp/api-stores-pos.md) § "Crear Sucursal"). El QR que devuelve MP al crear el POS es **estático e inmutable** — se guarda una vez y se imprime en la barra.

**Modelo operativo**: Cocktrail tiene 1 sola barra (`BARRA-01`/"Barra VIP"). La sucursal se crea automáticamente al onboardear (Fase 1). La UI de PDV muestra solo esta barra y su Posnet vinculado. El botón "+ Nueva barra" existe pero muestra una advertencia de que la funcionalidad multi-barra no está disponible todavía (está mapeado al `BAR_CODE` actual, no es dinámico).

### C) Backend — Endpoints de Provisionamiento

**Docs**: [`docs/mp/api-stores-pos.md`](../mp/api-stores-pos.md)

**C.1) Store (sucursal) — se crea automáticamente, no desde la UI**

La sucursal es Bosko — el comercio dueño del dinero vinculado vía OAuth. Se crea **una sola vez** como parte del onboarding. La UI solo muestra su estado.

```
POST /api/mercadopago/provisioning/store
  BODY: { barId, name, address }
  → POST /users/{seller.user_id}/stores (MP)
  → guarda store_id en mercadopago_cajas
```

**C.2) POS (caja) — CRUD completo desde la UI**

```
GET    /api/mercadopago/provisioning/cajas
  → lista todas las cajas del seller desde mercadopago_cajas
  → devuelve: [{ id, barId, posIdMp, externalPosId, qrImage, device? }]

POST   /api/mercadopago/provisioning/pos
  BODY: { barId, name }
  → credentialsResolver.resolve({ allowGlobalFallback: true })
  → POST /pos (MP) con fixed_amount=true, store_id, external_store_id, external_id
  → guarda en mercadopago_cajas (pos_id_mp, qr_image, qr_template, external_pos_id, seller_user_id)

DELETE /api/mercadopago/provisioning/pos/:id
  → elimina de mercadopago_cajas (cascada: devices huérfanos se limpian)
  → NOTA: no se cancela en MP (el POS queda; MP no tiene endpoint DELETE /pos)
```

**C.3) Device (Posnet) — vincular/desvincular**

```
POST   /api/mercadopago/provisioning/device
  BODY: { cajaId, deviceId, deviceUsername }
  → verifica que el device existe en MP (GET /point/integration-api/devices/{id})
  → inserta en mercadopago_cajas_devices (UNIQUE caja_id + UNIQUE device_id)

DELETE /api/mercadopago/provisioning/device/:id
  → elimina de mercadopago_cajas_devices

GET    /api/mercadopago/provisioning/devices
  → lista todos los devices vinculados con su caja
```

### D) Frontend — Panel PDV

**Arquitectura de componentes** (siguiendo el patrón `CartaSection`):

```
┌─ AdminClient.tsx ──────────────────────────────────────────┐
│  Sidebar: "PDV" tab (ícono Store)                          │
│  activeTab === "pdv" → <PdvSection />                      │
└────────────────────────────────────────────────────────────┘

┌─ PdvSection.tsx ───────────────────────────────────────────┐
│  Estado: cajas[], devices[], loading, error, saved, ...    │
│                                                             │
│  ┌─ Header ───────────────────────────────────────────┐   │
│  │  ícono + "Puntos de Venta" + badge "1 PDV activo"  │   │
│  │  botón "+ Nueva barra" (con tooltip/badge)          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Sucursal Card ────────────────────────────────────┐   │
│  │  Estado: "Vinculada — Bosko Bar (store_id: 1234567)"│   │
│  │  o "Pendiente — ejecutá el onboarding"              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ PDV Table ────────────────────────────────────────┐   │
│  │  Columnas: Barra | QR | Posnet | Acciones           │   │
│  │  ───────────────────────────────────────────────    │   │
│  │  Barra VIP         QR: 📋 copiar    PAX_A910__X     │   │
│  │  BARRA-01               ─── Ver QR  Apodo: Caja 1   │   │
│  │                                    [✕ desvincular]  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  {modalOpen && <PdvFormModal ... />}                        │
│  {saved && <Toast ... />}                                   │
│  {deleteConfirm && <SafeDeleteModal ... />}                 │
└─────────────────────────────────────────────────────────────┘
```

**D.1) `PdvSection.tsx`** — section shell

```tsx
// Estado
const [cajas, setCajas] = useState<CajaRow[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [modalOpen, setModalOpen] = useState(false);
const [editCaja, setEditCaja] = useState<PdvForm | null>(null);
const [saving, setSaving] = useState(false);
const [saved, setSaved] = useState(false);
const [deleteConfirm, setDeleteConfirm] = useState<CajaRow | null>(null);

// Carga inicial
useEffect(() => { loadData(); }, []);

async function loadData() {
  const [cajasData, devicesData] = await Promise.all([
    pdvService.listCajas(),
    pdvService.listDevices(),
  ]);
  // Merge: cada caja con su device vinculado (si tiene)
  setCajas(cajasData.map(c => ({ ...c, device: devicesData.find(d => d.cajaId === c.id) ?? null })));
}

// CRUD callbacks
async function handleCreate(form: PdvForm) {
  const caja = await pdvService.createCaja(form);
  setCajas(prev => [...prev, { ...caja, device: null }]);
  setSaved(true);
  setModalOpen(false);
}

async function handleDelete(caja: CajaRow) {
  await pdvService.deleteCaja(caja.id);
  setCajas(prev => prev.filter(c => c.id !== caja.id));
  setDeleteConfirm(null);
}

async function handleLinkDevice(cajaId: string, deviceId: string, username: string) {
  const device = await pdvService.linkDevice({ cajaId, deviceId, deviceUsername: username });
  setCajas(prev => prev.map(c => c.id === cajaId ? { ...c, device } : c));
}
```

**D.2) `PdvTable.tsx`** — grid de PDVs

```tsx
// Cada fila:
// ┌──────────────┬─────────────────────┬──────────────────────────┐
// │ Barra VIP    │ QR: [📋 copiar URL] │ Posnet: PAX_A910__X      │
// │ BARRA-01     │     [─── Ver QR ──] │ Apodo: Caja 1            │
// │              │                     │ [✕ desvincular]          │
// ├──────────────┼─────────────────────┼──────────────────────────┤
// │ (vacío = no  │ Sin QR              │ Sin Posnet               │
// │  hay cajas)  │                     │      [+ Vincular]        │
// └──────────────┴─────────────────────┴──────────────────────────┘
```

**D.3) `PdvFormModal.tsx`** — side-drawer para crear PDV

```tsx
// Campos:
// - Nombre de la barra (texto, ej. "Barra VIP")
// - Código de barra (pre-llenado con BAR_CODE, readonly)
//
// ⚠ Advertencia si el BAR_CODE != "BARRA-01" (única barra soportada):
//   "Esta funcionalidad solo está disponible para Barra VIP (BARRA-01).
//    Multi-barra no está implementado todavía."
//
// Footer: [Cancelar] [Crear PDV]
```

**D.4) Botón "+ Nueva barra"** — deshabilitado con advertencia

El botón de crear nueva barra muestra un tooltip/badge indicando que multi-barra no está disponible. Si `BAR_CODE` ya tiene una caja creada, el botón aparece deshabilitado con el texto "Solo Barra VIP disponible". Si no tiene caja (primer uso), el botón está activo y crea la caja para `BARRA-01`.

```tsx
<button
  onClick={() => setModalOpen(true)}
  disabled={cajas.length >= 1}
  className="..."
  title={cajas.length >= 1 ? "Solo Barra VIP disponible — multi-barra no implementado" : "Crear PDV para Barra VIP"}
>
  <Plus size={14} />
  {cajas.length >= 1 ? "Solo Barra VIP" : "+ Nueva barra"}
</button>
```

**D.5) Integración en `AdminClient.tsx`**

```tsx
// Import
import { Store } from "lucide-react";
import PdvSection from "@/components/settings/PdvSection";

// Sidebar button (en grupo "Configuración", antes de Pagos)
<button onClick={() => handleTabChange("pdv")} ...>
  <Store size={13} />
  <span>PDV</span>
</button>

// Render
{activeTab === "pdv" && (
  <div key="pdv" className="animate-dashboard-in">
    <PdvSection />
  </div>
)}
```

### E) Servicio frontend

**Archivo**: `apps/web/src/services/pdv.service.ts`

```ts
import { apiFetch } from "./api-client";

export type CajaRow = {
  id: string;
  barId: string;
  storeId: string;
  externalPosId: string;
  posIdMp: string | null;
  qrImage: string | null;
  qrTemplate: string | null;
  sellerUserId: string;
  createdAt: string;
  device?: DeviceRow | null;
};

export type DeviceRow = {
  id: string;
  cajaId: string;
  deviceId: string;
  deviceUsername: string | null;
  operatingMode: string | null;
};

export const pdvService = {
  listCajas()    { return apiFetch<CajaRow[]>("/api/mercadopago/provisioning/cajas"); },
  createCaja(b)  { return apiFetch<CajaRow>("/api/mercadopago/provisioning/pos", { method: "POST", body: b }); },
  deleteCaja(id) { return apiFetch<{ ok: true }>(`/api/mercadopago/provisioning/pos/${id}`, { method: "DELETE" }); },
  listDevices()  { return apiFetch<DeviceRow[]>("/api/mercadopago/provisioning/devices"); },
  linkDevice(b)  { return apiFetch<DeviceRow>("/api/mercadopago/provisioning/device", { method: "POST", body: b }); },
  unlinkDevice(id) { return apiFetch<{ ok: true }>(`/api/mercadopago/provisioning/device/${id}`, { method: "DELETE" }); },
};
```
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
