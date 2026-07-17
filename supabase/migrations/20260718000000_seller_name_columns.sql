-- 20260718000000_seller_name_columns.sql
-- Agrega first_name y last_name para mostrar nombre real en la UI
ALTER TABLE IF EXISTS mercadopago_sellers ADD COLUMN IF NOT EXISTS seller_first_name TEXT;
ALTER TABLE IF EXISTS mercadopago_sellers ADD COLUMN IF NOT EXISTS seller_last_name TEXT;
