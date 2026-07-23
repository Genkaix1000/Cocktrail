-- 20260724000100_bar_sessions_identity.sql
-- D6 (remediacion-integracion-mp, PR 6): la identidad de la sesión de caja deja de
-- incluir el deviceId de pestaña ("rol:username:uuid") y pasa a derivar de la sesión
-- autenticada ("rol:username"). Con eso reentrar desde cualquier pestaña devuelve la
-- propia caja y el logout la libera de verdad; el TTL de 2 minutos queda solo como
-- red de seguridad para el corte de luz.
--
-- Las filas vivas usan el formato viejo y se invalidan acá: desplegar FUERA DE TURNO
-- (la cajera conectada pierde su ocupación y tiene que reentrar desde /caja).

DELETE FROM bar_sessions WHERE user_id LIKE '%:%:%';

COMMENT ON COLUMN bar_sessions.user_id IS
  'Identidad "rol:username" derivada de la sesión autenticada (D6) — sin deviceId de pestaña.';
