"use client";

import { useCallback, useState } from "react";
import type { CashSale, EventSummary, NightEvent, Order } from "@cocktrail/shared";
import { eventsService } from "@/services/events.service";
import { useSSE } from "@/lib/useSSE";

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
}

type Options = {
  /**
   * Valores iniciales opcionales (ej. `AdminClient` los recibe como props
   * porque su página padre ya hizo su propio `eventsService.getState()`
   * antes de montarlo, para no mostrar un instante de estado vacío). Sin
   * esto, el estado arranca en `null`/`[]` hasta el primer `refetch`
   * (comportamiento que ya tenía `CajaClient`, que no recibe semilla).
   */
  initial?: {
    event?: NightEvent | null;
    orders?: Order[];
    cashSales?: CashSale[];
  };
  /** Se dispara tras order.created/order.updated/cash_sale.added, y en cada onOpen. */
  onActivity?: () => void;
  /** Se dispara tras event.closed, una vez que `summary` ya quedó seteado. */
  onEventClosed?: (summary: EventSummary) => void;
};

/**
 * Estado compartido de la noche (event/orders/cashSales/summary) + sync en
 * tiempo real por SSE, extraído de la duplicación casi idéntica que tenían
 * AdminClient.tsx y CajaClient.tsx (Fase 3B, deuda "useSSE centralizado").
 * BarraClient.tsx queda fuera a propósito: su modelo de estado (cola de
 * pendientes, toasts, modo dev) no comparte este molde de upsert-por-id.
 *
 * `setEvent`/`setSummary` se exponen porque los shells los necesitan para
 * flujos que no son SSE (respuestas HTTP directas: abrir noche, editar la
 * palabra clave, confirmar el cierre, limpiar el resumen al cerrar el
 * modal) — ahí no hay ningún invariante que proteger, es un reemplazo
 * completo del valor. `setOrders`/`setCashSales` NO se exponen crudos
 * porque sí hay un invariante (upsert-por-id); en cambio se expone
 * `upsertOrder`, que reusa la misma lógica interna para el único caso real
 * que lo necesita: `CajaClient` sincroniza el estado de un pedido tras una
 * respuesta HTTP directa (cancelar/reimprimir desde `HistorialSection`),
 * sin esperar el eco por SSE.
 */
export function useEventState(options?: Options) {
  const { initial, onActivity, onEventClosed } = options ?? {};

  const [event, setEvent] = useState<NightEvent | null>(initial?.event ?? null);
  const [orders, setOrders] = useState<Order[]>(initial?.orders ?? []);
  const [cashSales, setCashSales] = useState<CashSale[]>(initial?.cashSales ?? []);
  const [summary, setSummary] = useState<EventSummary | null>(null);

  const refetch = useCallback(async () => {
    try {
      const state = await eventsService.getState();
      setEvent(state.event);
      setOrders(state.orders ?? []);
      setCashSales(state.cashSales ?? []);
    } catch {
      // Sin conexión momentánea: el próximo evento SSE o reconexión reintenta.
    }
  }, []);

  useSSE(
    {
      "order.created": ({ order }) => {
        setOrders((prev) => upsertById(prev, order));
        onActivity?.();
      },
      "order.updated": ({ order }) => {
        setOrders((prev) => upsertById(prev, order));
        onActivity?.();
      },
      "cash_sale.added": ({ cashSale }) => {
        setCashSales((prev) => upsertById(prev, cashSale));
        onActivity?.();
      },
      "event.opened": ({ event: newEvent }) => {
        setEvent(newEvent);
        refetch();
      },
      "event.closed": ({ summary: closedSummary }) => {
        setSummary(closedSummary);
        refetch();
        onEventClosed?.(closedSummary);
      },
    },
    {
      // Una reconexión se trata como una actividad más, así Admin no pierde
      // el refresh de logs del sistema que hoy dispara en cada onOpen.
      onOpen: () => {
        refetch();
        onActivity?.();
      },
    },
  );

  const upsertOrder = useCallback((order: Order) => {
    setOrders((prev) => upsertById(prev, order));
  }, []);

  return { event, orders, cashSales, summary, setEvent, setSummary, upsertOrder, refetch };
}
