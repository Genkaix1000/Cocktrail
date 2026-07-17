-- 20260715000200_mercadopago_cajas.sql
-- Caja (POS) de MP por barra. Persiste store_id, external_pos_id y el QR estático.
-- Ver docs/specs/integracion-mp.md § "Modelo de datos" + docs/mp/api-stores-pos.md.

CREATE TABLE IF NOT EXISTS mercadopago_cajas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id          UUID NOT NULL REFERENCES bars(id),       -- FK a la tabla de barras de Cocktrail
  store_id        TEXT NOT NULL,                           -- ID numérico de MP
  external_pos_id TEXT NOT NULL,                           -- "COCKTRAIL-BAR-01"
  pos_id_mp       TEXT,                                    -- ID que MP asignó al POS (response.id)
  qr_image        TEXT,                                    -- URL estática del QR (response.qr.image)
  qr_template     TEXT,                                    -- URL template PDF (response.qr.template_document)
  seller_user_id  TEXT NOT NULL REFERENCES mercadopago_sellers(user_id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Un mismo seller no puede tener dos cajas con el mismo external_pos_id
  CONSTRAINT uq_caja_seller_external UNIQUE (seller_user_id, external_pos_id),

  -- 1 barra = 1 PDV (modelo operativo)
  UNIQUE (bar_id)
);

-- Índice para listar PDVs por vendedor
CREATE INDEX IF NOT EXISTS idx_cajas_seller ON mercadopago_cajas(seller_user_id);

-- Tabla de uso exclusivo del backend (service_role). Least-privilege: se revocan
-- los privilegios que los DEFAULT PRIVILEGES de Supabase otorgan a anon/authenticated.
GRANT ALL PRIVILEGES ON TABLE mercadopago_cajas TO postgres, service_role;
REVOKE ALL PRIVILEGES ON TABLE mercadopago_cajas FROM anon, authenticated;
