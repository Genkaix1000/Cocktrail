-- roles.sql — Password del rol que necesita PostgREST.
--
-- En la imagen `supabase/postgres` los roles ya existen (anon, authenticated,
-- service_role, authenticator, ...). PostgREST se conecta como `authenticator`
-- y luego hace SET ROLE al rol del claim del JWT (service_role / anon), así que
-- el ÚNICO rol que necesita password acá es `authenticator` (siempre existe en
-- la imagen base).
--
-- Nota: NO tocamos supabase_auth_admin / _functions_admin / _storage_admin:
-- en este stack recortado (sin auth/functions/storage) esos roles no existen,
-- y un ALTER sobre un rol inexistente abortaría el initdb entero.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
