-- 20260715000500_mp_oauth_cloud_columns.sql
-- Fase 1 (flujo OAuth cloud). Columnas extra que setea la Edge Function mp-auth-callback.
-- IMPORTANTE: aplicar esta migración también en el proyecto Supabase Cloud, junto con
-- todas las de Fase 0, ya que el flujo OAuth (oauth_states + mercadopago_sellers) vive ahí.

-- Vínculo barra ↔ seller (se setea al vincular OAuth). bar_id llega como contexto en oauth_states.
ALTER TABLE bars ADD COLUMN IF NOT EXISTS seller_user_id TEXT;

-- Datos públicos de la cuenta MP (se muestran en la UI, no son sensibles).
ALTER TABLE mercadopago_sellers ADD COLUMN IF NOT EXISTS seller_nickname TEXT;
ALTER TABLE mercadopago_sellers ADD COLUMN IF NOT EXISTS seller_email TEXT;
