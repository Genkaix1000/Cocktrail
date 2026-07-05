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
 * modal). `setOrders`/`setCashSales` NO se exponen — nada fuera de este
 * hook necesita mutarlos a mano.
 */
export function useEventState(options?: Options) {
  const { onActivity, onEventClosed } = options ?? {};

  const [event, setEvent] = useState<NightEvent | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cashSales, setCashSales] = useState<CashSale[]>([]);
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

  return { event, orders, cashSales, summary, setEvent, setSummary, refetch };
}
