-- 20260715000000_bars.sql
-- Tabla mínima de barras de Cocktrail.
-- Prerequisito de la integración MP: mercadopago_cajas.bar_id referencia bars(id).
-- El modelo operativo es 1 caja MP por barra (ver docs/specs/integracion-mp.md).

CREATE TABLE IF NOT EXISTS bars (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Barras no son datos sensibles: acceso estándar de la API.
GRANT ALL PRIVILEGES ON TABLE bars TO postgres, anon, authenticated, service_role;
