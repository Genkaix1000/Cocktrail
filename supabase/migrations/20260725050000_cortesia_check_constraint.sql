ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_cobrado_requires_mp_order;
ALTER TABLE orders ADD CONSTRAINT orders_cobrado_requires_mp_order
  CHECK (payment_status <> 'cobrado' OR payment_method = 'efectivo' OR payment_method = 'cortesia' OR mp_order_id IS NOT NULL);
