-- Ponytail audit: dropear tablas/columnas muertas.
-- - cash_sales: 0 filas, sin INSERT en la app
-- - mercadopago_seller_handoff: buzón OAuth deprecated (F0)
-- - night_events.sync_status / synced_at: sync module eliminado

-- ---------------------------------------------------------------------------
-- preview_night sin cash_sales
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_night(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_noche night_events%ROWTYPE;
  v_res   jsonb;
BEGIN
  SELECT * INTO v_noche FROM night_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOCHE_NO_ENCONTRADA: no existe una noche con id %', p_event_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT jsonb_build_object(
    'event_id',            v_noche.id,
    'status',              v_noche.status,
    'fecha_ar',            (v_noche.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
    'keyword',             v_noche.keyword,
    'started_at',          v_noche.started_at,
    'closed_at',           v_noche.closed_at,
    'pedidos',             pedidos.total_pedidos,
    'pedidos_cancelados',  pedidos.cancelados,
    'total_facturado',     pedidos.facturado,
    'tickets',             tk.cantidad,
    'cash_sales',          0,
    'cash_sales_monto',    0,
    'mp_orders',           mp.cantidad,
    'mp_orders_cobrados',  mp.cobrados,
    'mp_monto_cobrado',    mp.monto_cobrado,
    'mp_sin_event_id',     mp.sin_event_id
  )
  INTO v_res
  FROM (
    SELECT
      count(*)::int                                                          AS total_pedidos,
      count(*) FILTER (WHERE o.status = 'cancelado')::int                    AS cancelados,
      coalesce(sum(o.total) FILTER (WHERE o.status <> 'cancelado'), 0)::int   AS facturado
    FROM orders o WHERE o.event_id = p_event_id
  ) pedidos
  CROSS JOIN (
    SELECT count(*)::int AS cantidad
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    WHERE o.event_id = p_event_id
  ) tk
  CROSS JOIN (
    SELECT
      count(*)::int                                            AS cantidad,
      count(*) FILTER (WHERE m.status = 'processed')::int       AS cobrados,
      coalesce(
        sum(coalesce(m.paid_amount, m.amount)) FILTER (WHERE m.status = 'processed'), 0
      )::numeric(12,2)                                         AS monto_cobrado,
      count(*) FILTER (WHERE m.event_id IS NULL)::int           AS sin_event_id
    FROM mp_orders m
    WHERE m.id IN (SELECT n.mp_order_id FROM night_mp_order_ids(p_event_id) n)
  ) mp;

  RETURN v_res;
END;
$$;

-- ---------------------------------------------------------------------------
-- delete_night sin DELETE cash_sales
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_night(
  p_event_id         uuid,
  p_expected_ar_date date DEFAULT NULL,
  p_operator         text DEFAULT 'sistema'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_noche       night_events%ROWTYPE;
  v_fecha_ar    date;
  v_resumen     jsonb;
  v_mp_ids      uuid[];
  v_webhooks    int := 0;
  v_desligados  int := 0;
  v_orders      int := 0;
  v_tickets     int := 0;
  v_mp          int := 0;
BEGIN
  SELECT * INTO v_noche FROM night_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOCHE_NO_ENCONTRADA: no existe una noche con id %', p_event_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_noche.status = 'activo' THEN
    RAISE EXCEPTION 'NOCHE_ACTIVA: la noche % está activa, hay que cerrarla antes de borrarla', p_event_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  v_fecha_ar := (v_noche.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;

  IF p_expected_ar_date IS NOT NULL AND p_expected_ar_date <> v_fecha_ar THEN
    RAISE EXCEPTION 'FECHA_NO_COINCIDE: la noche % es del % y se esperaba %',
      p_event_id, v_fecha_ar, p_expected_ar_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_resumen := preview_night(p_event_id);

  SELECT coalesce(array_agg(n.mp_order_id), '{}') INTO v_mp_ids
  FROM night_mp_order_ids(p_event_id) n;

  UPDATE mp_webhook_events w
  SET processed_at = now(),
      last_error = coalesce(w.last_error || ' | ', '')
        || 'neutralizado por delete_night(' || p_event_id::text || ')'
  WHERE w.processed_at IS NULL
    AND w.data_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM mp_orders m
      WHERE m.id = ANY(v_mp_ids)
        AND (m.payment_id = w.data_id OR m.payment_transaction_id = w.data_id)
    );
  GET DIAGNOSTICS v_webhooks = ROW_COUNT;

  SELECT count(*)::int INTO v_tickets
  FROM tickets t JOIN orders o ON o.id = t.order_id WHERE o.event_id = p_event_id;

  DELETE FROM orders WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  DELETE FROM mp_orders WHERE id = ANY(v_mp_ids);
  GET DIAGNOSTICS v_mp = ROW_COUNT;

  UPDATE mp_orders SET event_id = NULL, updated_at = now()
  WHERE event_id = p_event_id AND NOT (id = ANY(v_mp_ids));
  GET DIAGNOSTICS v_desligados = ROW_COUNT;

  DELETE FROM night_events WHERE id = p_event_id;

  INSERT INTO audit_logs (action, description, operator, created_at)
  VALUES (
    'noche_borrada',
    format(
      'Noche %s (%s) borrada. Pedidos: %s (%s cancelados). Facturado: $%s. Tickets: %s. Cobros MP: %s ($%s cobrados). Webhooks neutralizados: %s. Cobros desligados: %s.',
      v_fecha_ar,
      p_event_id,
      v_resumen->>'pedidos',
      v_resumen->>'pedidos_cancelados',
      v_resumen->>'total_facturado',
      v_tickets,
      v_mp,
      v_resumen->>'mp_monto_cobrado',
      v_webhooks,
      v_desligados
    ),
    p_operator,
    now()
  );

  RETURN v_resumen || jsonb_build_object(
    'borrado', jsonb_build_object(
      'orders',              v_orders,
      'tickets',             v_tickets,
      'cash_sales',          0,
      'mp_orders',           v_mp,
      'webhooks_neutralizados', v_webhooks,
      'mp_orders_desligados',   v_desligados
    ),
    'operator', p_operator
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.preview_night(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_night(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_night(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_night(uuid, date, text) TO service_role;

DROP TABLE IF EXISTS public.cash_sales;
DROP TABLE IF EXISTS public.mercadopago_seller_handoff;

ALTER TABLE public.night_events DROP COLUMN IF EXISTS sync_status;
ALTER TABLE public.night_events DROP COLUMN IF EXISTS synced_at;
