-- 20260808120000_delete_night.sql
-- Borrado atómico de una noche registrada (spec: docs/specs/noches-de-prueba-y-borrado.md, sección D).
--
-- Por qué una función de Postgres y no 4 DELETE desde supabase-js: hay que borrar en 4 tablas con
-- dos FKs sin cascada (orders.mp_order_id → mp_orders es ON DELETE NO ACTION). supabase-js no tiene
-- transacciones: serían 4 requests HTTP sueltos y un fallo a mitad deja las ventas borradas con los
-- cobros de MP vivos — estado no recuperable. PostgREST corre cada RPC en UNA transacción.
--
-- SECURITY INVOKER (no DEFINER) a propósito: service_role ya tiene BYPASSRLS + ALL PRIVILEGES
-- (20260722000200_revoke_anon_legacy.sql), así que DEFINER no habilitaría nada y sí agregaría
-- superficie de escalada en una función que borra plata.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.delete_night(uuid, date, text);
--   DROP FUNCTION IF EXISTS public.preview_night(uuid);
--   DROP FUNCTION IF EXISTS public.find_nights_by_ar_date(date);
--   DROP FUNCTION IF EXISTS public.night_mp_order_ids(uuid);

-- ---------------------------------------------------------------------------
-- night_mp_order_ids: el set de cobros de MP que pertenecen a una noche.
-- ---------------------------------------------------------------------------
-- mp_orders.event_id es nullable y NUNCA tuvo backfill (20260721000100_mp_orders_event_id.sql):
-- hay cobros de la noche cuya única pista es orders.mp_order_id. El set es la UNIÓN de ambas
-- fuentes, MENOS cualquiera referenciado por una venta de OTRA noche (guarda contra datos sucios:
-- borrar ese cobro violaría la FK de la otra venta y abortaría toda la transacción).
CREATE OR REPLACE FUNCTION public.night_mp_order_ids(p_event_id uuid)
RETURNS TABLE (mp_order_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT candidatos.id
  FROM (
    SELECT mo.id FROM mp_orders mo WHERE mo.event_id = p_event_id
    UNION
    SELECT o.mp_order_id FROM orders o
      WHERE o.event_id = p_event_id AND o.mp_order_id IS NOT NULL
  ) AS candidatos(id)
  WHERE NOT EXISTS (
    SELECT 1 FROM orders ajena
    WHERE ajena.mp_order_id = candidatos.id
      AND ajena.event_id <> p_event_id
  );
$$;

-- ---------------------------------------------------------------------------
-- preview_night: qué se pierde si se borra esta noche. No modifica nada.
-- ---------------------------------------------------------------------------
-- fecha_ar SIEMPRE con huso explícito: el servidor corre en UTC y `started_at::date` mandaría
-- todo lo posterior a las 21:00 al día siguiente. Mismo criterio que claveDiaArgentina()
-- (apps/api/src/shared/utils/fechas.ts).
--
-- total_facturado EXCLUYE status = 'cancelado', igual que computeTotals
-- (packages/shared/src/domain.ts). orders.total es INT (pesos); mp_orders.paid_amount es
-- NUMERIC(12,2) y es la autoridad post-20260722000000, con fallback a amount.
CREATE OR REPLACE FUNCTION public.preview_night(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_noche   night_events%ROWTYPE;
  v_res     jsonb;
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
    'cash_sales',          cs.cantidad,
    'cash_sales_monto',    cs.monto,
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
    SELECT count(*)::int AS cantidad, coalesce(sum(c.amount), 0)::int AS monto
    FROM cash_sales c WHERE c.event_id = p_event_id
  ) cs
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
-- find_nights_by_ar_date: resolver "la noche del viernes" a uno o más ids.
-- ---------------------------------------------------------------------------
-- La noche se clasifica por started_at: una fiesta que arranca el viernes 23:00 y termina el
-- sábado 05:00 es "la noche del viernes".
CREATE OR REPLACE FUNCTION public.find_nights_by_ar_date(p_fecha date)
RETURNS TABLE (
  event_id   uuid,
  fecha_ar   date,
  status     text,
  keyword    text,
  started_at timestamptz,
  closed_at  timestamptz,
  pedidos    int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    ne.id,
    (ne.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
    ne.status,
    ne.keyword,
    ne.started_at,
    ne.closed_at,
    (SELECT count(*)::int FROM orders o WHERE o.event_id = ne.id)
  FROM night_events ne
  WHERE (ne.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = p_fecha
  ORDER BY ne.started_at;
$$;

-- ---------------------------------------------------------------------------
-- delete_night: borra la noche y todo lo que cuelga de ella. Todo o nada.
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
  v_cash        int := 0;
  v_mp          int := 0;
BEGIN
  -- FOR UPDATE serializa contra un cierre de noche o un segundo borrado concurrente.
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

  -- El resumen se calcula ANTES de borrar: es lo que se devuelve y lo que se audita.
  v_resumen := preview_night(p_event_id);

  -- El set de cobros también se congela ANTES: se deduce en parte de orders.mp_order_id,
  -- que deja de existir en cuanto se borran los pedidos.
  SELECT coalesce(array_agg(n.mp_order_id), '{}') INTO v_mp_ids
  FROM night_mp_order_ids(p_event_id) n;

  -- mp_webhook_events NO tiene FK a mp_orders: se liga por data_id (texto) contra payment_id o
  -- payment_transaction_id. Los pendientes se neutralizan en vez de borrarse — si quedaran
  -- pendientes, replayPending() los reintentaría contra una fila inexistente en cada arranque.
  -- Se conserva la evidencia del webhook.
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

  -- Orden obligado por las FKs: tickets cuelga de orders por CASCADE, y orders.mp_order_id
  -- es ON DELETE NO ACTION, así que las ventas se van antes que los cobros.
  SELECT count(*)::int INTO v_tickets
  FROM tickets t JOIN orders o ON o.id = t.order_id WHERE o.event_id = p_event_id;

  DELETE FROM orders WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  DELETE FROM cash_sales WHERE event_id = p_event_id;
  GET DIAGNOSTICS v_cash = ROW_COUNT;

  DELETE FROM mp_orders WHERE id = ANY(v_mp_ids);
  GET DIAGNOSTICS v_mp = ROW_COUNT;

  -- Caso de datos sucios: un cobro con event_id = esta noche pero referenciado por una venta de
  -- OTRA noche queda fuera del set (borrarlo violaría la FK de esa venta). mp_orders.event_id es
  -- ON DELETE NO ACTION, así que si no se lo desliga, el DELETE de la noche aborta. Se pone en
  -- NULL —el estado en el que nacieron todas las filas previas al backfill que nunca hubo— en vez
  -- de borrar el cobro, que es la única evidencia server-side de esa venta ajena (R27).
  UPDATE mp_orders SET event_id = NULL, updated_at = now()
  WHERE event_id = p_event_id AND NOT (id = ANY(v_mp_ids));
  GET DIAGNOSTICS v_desligados = ROW_COUNT;

  DELETE FROM night_events WHERE id = p_event_id;

  -- audit_logs no tiene FK a nada: el rastro del borrado sobrevive al borrado. Va DENTRO de la
  -- misma transacción, así que no puede perderse por un fallo parcial (criterio D7).
  INSERT INTO audit_logs (action, description, operator, created_at)
  VALUES (
    'noche_borrada',
    format(
      'Noche %s (%s) borrada. Pedidos: %s (%s cancelados). Facturado: $%s. Tickets: %s. Ventas efectivo: %s ($%s). Cobros MP: %s ($%s cobrados). Webhooks neutralizados: %s. Cobros desligados: %s.',
      v_fecha_ar,
      p_event_id,
      v_resumen->>'pedidos',
      v_resumen->>'pedidos_cancelados',
      v_resumen->>'total_facturado',
      v_tickets,
      v_cash,
      v_resumen->>'cash_sales_monto',
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
      'cash_sales',          v_cash,
      'mp_orders',           v_mp,
      'webhooks_neutralizados', v_webhooks,
      'mp_orders_desligados',   v_desligados
    ),
    'operator', p_operator
  );
END;
$$;

-- Solo el backend (service_role) ejecuta estas funciones. El REVOKE explícito a
-- anon/authenticated es OBLIGATORIO: Supabase tiene DEFAULT PRIVILEGES que les dan EXECUTE a
-- toda función nueva (advisors 0028/0029) y REVOKE FROM PUBLIC no los alcanza.
REVOKE EXECUTE ON FUNCTION public.night_mp_order_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preview_night(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_nights_by_ar_date(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_night(uuid, date, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.night_mp_order_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_night(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_nights_by_ar_date(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_night(uuid, date, text) TO service_role;
