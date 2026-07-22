-- 20260721000000_mp_orders_unique.sql
-- PR 3 (A3): garantía de no-duplicación a nivel DB. Sin UNIQUE, un doble POST
-- que esquive la idempotencia de aplicación deja dos filas por el mismo cobro.
-- Dedupe previo (conserva la fila más vieja) para que los índices puedan crearse
-- sobre una base que ya tenga duplicados.

DELETE FROM mp_orders
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY order_id_mp
             ORDER BY created_at ASC NULLS LAST, id ASC
           ) AS rn
    FROM mp_orders
  ) t
  WHERE t.rn > 1
);

DELETE FROM mp_orders
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY external_ref
             ORDER BY created_at ASC NULLS LAST, id ASC
           ) AS rn
    FROM mp_orders
  ) t
  WHERE t.rn > 1
);

DELETE FROM mp_orders
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY idempotency_key
             ORDER BY created_at ASC NULLS LAST, id ASC
           ) AS rn
    FROM mp_orders
  ) t
  WHERE t.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_orders_order_id_mp     ON mp_orders(order_id_mp);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_orders_external_ref    ON mp_orders(external_ref);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_orders_idempotency_key ON mp_orders(idempotency_key);

-- Los índices no-únicos de 20260717221900_mp_orders.sql sobre estas dos columnas
-- quedan redundantes (el UNIQUE ya indexa). idx_mp_orders_payment_id se conserva:
-- payment_id no tiene UNIQUE.
DROP INDEX IF EXISTS idx_mp_orders_order_id_mp;
DROP INDEX IF EXISTS idx_mp_orders_external_ref;
