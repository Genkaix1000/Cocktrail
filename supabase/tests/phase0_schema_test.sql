-- Fase 0 — pgTAP: validación de schema, constraints, RPC y RLS.
-- Correr:  docker exec -i cocktrail-db psql -U postgres -d <db> -f - < supabase/tests/phase0_schema_test.sql
-- Requiere la extensión pgtap (migración 20260715000600_pgtap_extension.sql).
--
-- Notas vs. docs/plans/mercadopago/plan-implementacion-mp.md § Fase 0 C.6:
--   * plan(32): el plan indicaba 31 pero enumera 32 asserts.
--   * Firmas pgTAP corregidas respecto al pseudo-SQL del plan:
--       - has_table(schema, table, desc)               [el plan usaba la forma de 2 args]
--       - has_column(schema, table, column, desc)      [el plan usaba la de 3 args]
--       - throws_ok(sql, errcode, NULL, desc)          [el 3er arg es el mensaje, no la desc]
--   * Se agrega una segunda barra fixture (BAR '…002') para aislar el test de
--     FK seller_user_id: con una sola barra ya usada, el INSERT chocaría primero
--     con UNIQUE(bar_id) (23505) en vez de la FK de seller (23503).

BEGIN;
SELECT plan(32);

-- ── 1) Existencia de tablas ──
SELECT has_table('public', 'oauth_states', 'tabla oauth_states existe');
SELECT has_table('public', 'mercadopago_sellers', 'tabla mercadopago_sellers existe');
SELECT has_table('public', 'mercadopago_cajas', 'tabla mercadopago_cajas existe');
SELECT has_table('public', 'mercadopago_cajas_devices', 'tabla mercadopago_cajas_devices existe');

-- ── 2) Columnas clave ──
SELECT has_column('public', 'oauth_states', 'state', 'oauth_states.state');
SELECT has_column('public', 'oauth_states', 'code_verifier', 'oauth_states.code_verifier');
SELECT has_column('public', 'oauth_states', 'expires_at', 'oauth_states.expires_at');

SELECT has_column('public', 'mercadopago_sellers', 'user_id', 'sellers.user_id');
SELECT has_column('public', 'mercadopago_sellers', 'access_token', 'sellers.access_token');
SELECT has_column('public', 'mercadopago_sellers', 'expires_at', 'sellers.expires_at');
SELECT has_column('public', 'mercadopago_sellers', 'updated_at', 'sellers.updated_at');

SELECT has_column('public', 'mercadopago_cajas', 'bar_id', 'cajas.bar_id');
SELECT has_column('public', 'mercadopago_cajas', 'seller_user_id', 'cajas.seller_user_id');
SELECT has_column('public', 'mercadopago_cajas', 'external_pos_id', 'cajas.external_pos_id');

SELECT has_column('public', 'mercadopago_cajas_devices', 'caja_id', 'devices.caja_id');
SELECT has_column('public', 'mercadopago_cajas_devices', 'device_id', 'devices.device_id');

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
INSERT INTO bars (id) VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO bars (id) VALUES ('00000000-0000-0000-0000-000000000002');  -- spare para test FK seller

INSERT INTO mercadopago_sellers (user_id, access_token, refresh_token, expires_at, status)
VALUES ('seller_1', 'at_1', 'rt_1', now() + interval '1 hour', 'active');

INSERT INTO mercadopago_cajas (id, bar_id, store_id, external_pos_id, seller_user_id)
VALUES ('00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000001',
        '123', 'BAR-01', 'seller_1');

-- ── 8) UNIQUE(seller_user_id, external_pos_id) ──
-- Usa la barra spare (…002) para chocar SOLO con el unique compuesto, no con UNIQUE(bar_id).
SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas (bar_id, store_id, external_pos_id, seller_user_id)
     VALUES ('00000000-0000-0000-0000-000000000002', '123', 'BAR-01', 'seller_1') $$,
  '23505', NULL,
  'uq_caja_seller_external: no permite duplicar para el mismo seller'
);

-- ── 9) UNIQUE(bar_id) ──
SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas (bar_id, store_id, external_pos_id, seller_user_id)
     VALUES ('00000000-0000-0000-0000-000000000001', '123', 'BAR-02', 'seller_1') $$,
  '23505', NULL,
  'UNIQUE(bar_id): no permite 2 cajas para la misma barra'
);

-- ── 10) Devices: UNIQUE(caja_id) ──
INSERT INTO mercadopago_cajas_devices (caja_id, device_id, operating_mode)
VALUES ('00000000-0000-0000-0000-000000000010', 'DEV_1', 'PDV');

SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas_devices (caja_id, device_id)
     VALUES ('00000000-0000-0000-0000-000000000010', 'DEV_2') $$,
  '23505', NULL,
  'UNIQUE(caja_id): no permite 2 terminals para la misma caja'
);

-- ── 11) Devices: UNIQUE(device_id) ──
SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas_devices (caja_id, device_id)
     VALUES ('00000000-0000-0000-0000-000000000010', 'DEV_1') $$,
  '23505', NULL,
  'UNIQUE(device_id): no permite reusar el mismo device_id'
);

-- ── 12) FK: bar_id inexistente ──
SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas (bar_id, store_id, external_pos_id, seller_user_id)
     VALUES ('00000000-0000-0000-0000-000000000099', '999', 'BAR-99', 'seller_1') $$,
  '23503', NULL,
  'FK bar_id: rechaza barra inexistente'
);

-- ── 13) FK: seller_user_id inexistente ──
-- Usa la barra spare (…002) para no chocar con UNIQUE(bar_id) antes que la FK.
SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas (bar_id, store_id, external_pos_id, seller_user_id)
     VALUES ('00000000-0000-0000-0000-000000000002', '123', 'BAR-03', 'seller_fake') $$,
  '23503', NULL,
  'FK seller_user_id: rechaza seller inexistente'
);

-- ── 14) FK: caja_id inexistente en devices ──
SELECT throws_ok(
  $$ INSERT INTO mercadopago_cajas_devices (caja_id, device_id)
     VALUES ('00000000-0000-0000-0000-000000000099', 'DEV_3') $$,
  '23503', NULL,
  'FK caja_id: rechaza caja inexistente'
);

-- ── 15) updated_at existe con default ──
SELECT ok(
  (SELECT updated_at FROM mercadopago_sellers WHERE user_id = 'seller_1') IS NOT NULL,
  'updated_at inicial existe con DEFAULT NOW()'
);

-- ── 16) RLS: cliente (anon) no puede leer mercadopago_sellers ──
SET LOCAL role anon;
SELECT throws_ok(
  $$ SELECT * FROM mercadopago_sellers $$,
  '42501', NULL,
  'RLS: anon no puede leer mercadopago_sellers'
);
RESET role;

-- ── 17) RLS: cliente (authenticated) no puede leer ──
SET LOCAL role authenticated;
SELECT throws_ok(
  $$ SELECT * FROM mercadopago_sellers $$,
  '42501', NULL,
  'RLS: authenticated no puede leer mercadopago_sellers'
);
RESET role;

SELECT * FROM finish();
ROLLBACK;
