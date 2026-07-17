-- 20260715000600_pgtap_extension.sql
-- pgTAP para tests de schema/constraints/RPC en la DB local de desarrollo.
-- No instalar en producción.

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA public;
