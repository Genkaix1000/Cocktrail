"use client";

import { useCallback, useRef, useState } from "react";
import type { EventSummary, EventTotals, NightEvent, Order } from "@cocktrail/shared";
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
  initial?: {
    event?: NightEvent | null;
    orders?: Order[];
    totals?: EventTotals | null;
  };
  onActivity?: () => void;
  onEventClosed?: (summary: EventSummary) => void;
};

/**
 * Estado compartido de la noche (event/orders/summary/totals) + sync SSE.
 * `serverTotals` trae mpFeeTotal/netTotal del snapshot; los shells los
 * mezclan con computeTotals(orders) vía withLiveMpFees.
 */
export function useEventState(options?: Options) {
  const { initial, onActivity, onEventClosed } = options ?? {};

  const [event, setEvent] = useState<NightEvent | null>(initial?.event ?? null);
  const [orders, setOrders] = useState<Order[]>(initial?.orders ?? []);
  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [serverTotals, setServerTotals] = useState<EventTotals | null>(
    initial?.totals ?? null,
  );
  const feeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    try {
      const state = await eventsService.getState();
      setEvent(state.event);
      setOrders(state.orders ?? []);
      setServerTotals(state.totals ?? null);
    } catch {
      // Sin conexión momentánea: el próximo evento SSE o reconexión reintenta.
    }
  }, []);

  const scheduleFeeRefresh = useCallback(() => {
    if (feeRefreshTimer.current) clearTimeout(feeRefreshTimer.current);
    feeRefreshTimer.current = setTimeout(() => {
      void refetch();
    }, 400);
  }, [refetch]);

  useSSE(
    {
      "order.created": ({ order }) => {
        setOrders((prev) => upsertById(prev, order));
        scheduleFeeRefresh();
        onActivity?.();
      },
      "order.updated": ({ order }) => {
        setOrders((prev) => upsertById(prev, order));
        scheduleFeeRefresh();
        onActivity?.();
      },
      "event.opened": ({ event: newEvent }) => {
        setEvent(newEvent);
        setOrders([]);
        setServerTotals(null);
        setSummary(null);
        refetch();
      },
      "event.closed": ({ summary: closedSummary }) => {
        setSummary(closedSummary);
        setEvent(null);
        refetch();
        onEventClosed?.(closedSummary);
      },
    },
    {
      onOpen: () => {
        refetch();
        onActivity?.();
      },
    },
  );

  const upsertOrder = useCallback((order: Order) => {
    setOrders((prev) => upsertById(prev, order));
    scheduleFeeRefresh();
  }, [scheduleFeeRefresh]);

  return {
    event,
    orders,
    summary,
    serverTotals,
    setEvent,
    setSummary,
    upsertOrder,
    refetch,
  };
}
