-- 20260718010000_sellers_nullable_tokens.sql
-- Local solo necesita user_id para FKs. Los tokens viven en Cloud como fuente de verdad.
-- Permitir stubs sin access_token/expires_at para que el provisioning no necesite replicar secretos.

ALTER TABLE mercadopago_sellers ALTER COLUMN access_token DROP NOT NULL;
ALTER TABLE mercadopago_sellers ALTER COLUMN expires_at DROP NOT NULL;
