-- Fase 1 — pgTAP: RPC consume_oauth_state (C.5 #8–10).
-- Correr:  docker exec -i cocktrail-db psql -U postgres -d <db> -f - < supabase/tests/phase1_oauth_rpc_test.sql
-- Requiere pgtap (migración 20260715000600_pgtap_extension.sql) y la RPC de Fase 0.
--
-- Nota sobre concurrencia (#10): la RPC hace DELETE ... RETURNING en UNA sola
-- sentencia, que es atómica en Postgres. Dos consumos del mismo state: solo el
-- primero borra la fila y devuelve datos; el segundo no ve filas. Eso es el
-- "single-winner" observable (no hace falta simular dos sesiones en paralelo).

BEGIN;
SELECT plan(4);

-- #8 — primer consumo devuelve datos
INSERT INTO oauth_states (state, code_verifier, bar_id, expires_at)
VALUES ('p1_ok', 'ver_ok', 'BARRA-01', now() + interval '10 minutes');

SELECT results_eq(
  $$ SELECT code_verifier, bar_id, redirect_url FROM consume_oauth_state('p1_ok') $$,
  $$ VALUES ('ver_ok'::text, 'BARRA-01'::text, NULL::text) $$,
  '#8a consume_oauth_state: primer consumo devuelve code_verifier + bar_id + redirect_url'
);

-- #8b — segundo consumo del mismo state no devuelve nada (single-winner / one-shot)
SELECT is(
  (SELECT count(*) FROM consume_oauth_state('p1_ok'))::int,
  0,
  '#8b consume_oauth_state: segundo consumo no devuelve filas'
);

-- #9 — state expirado no se consume
INSERT INTO oauth_states (state, code_verifier, bar_id, expires_at)
VALUES ('p1_exp', 'ver_exp', NULL, now() - interval '1 minute');

SELECT is(
  (SELECT count(*) FROM consume_oauth_state('p1_exp'))::int,
  0,
  '#9 consume_oauth_state: state expirado no devuelve filas'
);

-- #9b — el state expirado permanece (no lo consumió) hasta que expire un cleanup externo
SELECT is(
  (SELECT count(*) FROM oauth_states WHERE state = 'p1_exp')::int,
  1,
  '#9b consume_oauth_state: no borra states expirados (no matchea el WHERE expires_at > now())'
);

SELECT * FROM finish();
ROLLBACK;
