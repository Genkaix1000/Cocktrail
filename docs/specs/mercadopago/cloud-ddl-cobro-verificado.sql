-- DDL para Supabase CLOUD (proyecto nmdvrmglmnbpoyfjmgab) — spec cobro-verificado (R27).
-- Pegar tal cual en el SQL Editor del dashboard de Supabase y ejecutar UNA vez.
-- Es idempotente: correrlo dos veces no falla ni cambia nada.
--
-- Por qué: el cierre de noche (pushOrders del módulo sync) pasa a subir estas 4
-- columnas nuevas de `orders`. Si Cloud no las tiene, PostgREST rechaza el upsert
-- y el push del cierre falla entero.
--
-- SIN foreign key a mp_orders a propósito: Cloud es archivo histórico, no fuente
-- de verdad — una FK acá solo agregaría modos de fallo al push (orden de inserción,
-- filas faltantes por un push parcial anterior) sin ganar integridad que importe.
-- (Decisión documentada en docs/specs/mercadopago/cobro-verificado.md, plan técnico.)

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS mp_order_id     UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS mp_payment_id   TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status  TEXT;

-- Verificación rápida (debería devolver las 4 filas):
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'orders'
--    AND column_name IN ('mp_order_id','mp_payment_id','idempotency_key','payment_status');
