-- jwt.sql — Expone el JWT secret a la base como GUC.
-- No es estrictamente necesario para este stack (PostgREST valida el JWT con
-- PGRST_JWT_SECRET, no con la base), pero lo dejamos por compatibilidad con
-- helpers tipo `auth.jwt()` si en el futuro se agregan policies/RLS.
\set jwt_secret `echo "$JWT_SECRET"`
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_secret" TO :'jwt_secret';
ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
