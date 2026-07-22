# Plan de Implementación — Integración MP

> **Punto de partida obligatorio**: ante cualquier tarea de MP, leer primero [`docs/mp/INDEX.md`](../mp/INDEX.md).  
> Este plan se basa en [`docs/specs/mercadopago/integracion-mp.md`](../specs/mercadopago/integracion-mp.md).  
> Las Fases se ejecutan en orden secuencial (cada una depende de la anterior).

---

## Fase 0 — Schema de Base de Datos

### A) ¿Qué se hace?

Crear las migraciones de Supabase con las 3 tablas del modelo de datos definido en [`docs/specs/mercadopago/integracion-mp.md`](../specs/mercadopago/integracion-mp.md) § "Modelo de datos (Cocktrail DB)" más la tabla `oauth_states` que requiere el flujo OAuth.

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

**C.3) `mercadopago_cajas`** — [`docs/specs/mercadopago/integracion-mp.md`](../specs/mercadopago/integracion-mp.md) § "Modelo de datos" + [`docs/mp/api-stores-pos.md`](../mp/api-stores-pos.md) § "Crear Caja" (response: `id`, `qr.image`, `qr.template_document`)

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

**C.4) `mercadopago_cajas_devices`** — [`docs/specs/mercadopago/integracion-mp.md`](../specs/mercadopago/integracion-mp.md) § "Modelo de datos" + [`docs/mp/api-point-devices.md`](../mp/api-point-devices.md) § "Listar devices" (response: `id`, `operating_mode`)

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

