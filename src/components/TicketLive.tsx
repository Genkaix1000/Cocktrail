"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSSE } from "@/lib/useSSE";
import type { Order } from "@/types/domain";
import Ticket from "./Ticket";

type Props = { initialOrder: Order };

export default function TicketLive({ initialOrder }: Props) {
  const [order, setOrder] = useState<Order>(initialOrder);
  const prevStatus = useRef(initialOrder.status);
  const token = initialOrder.token;

  // Cubre dos ventanas donde se podrían perder eventos:
  // 1. Inicial: entre SSR y primer onopen del EventSource.
  // 2. Reconexión: tras un drop de red.
  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const state = (await res.json()) as { orders?: Order[] };
      const found = state.orders?.find((o) => o.token === token);
      if (found) setOrder(found);
    } catch {
      // Network glitch — el próximo onopen reintentará.
    }
  }, [token]);

  useSSE(
    {
      "order.updated": ({ order: updated }) => {
        if (updated.token === token) setOrder(updated);
      },
    },
    { onOpen: refetch },
  );

  // Vibración + title flash solo en la TRANSICIÓN a listo
  // (no al renderear si ya viene listo desde el server).
  useEffect(() => {
    if (order.status === "listo" && prevStatus.current !== "listo") {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      document.title = "🟢 Tu trago está listo — Cocktrail";
    }
    prevStatus.current = order.status;
  }, [order.status]);

  // Restaurar título al desmontar (cerrar pestaña no llega acá, pero
  // si navega a otra ruta sí).
  useEffect(() => {
    const original = document.title;
    return () => {
      document.title = original;
    };
  }, []);

  return <Ticket order={order} />;
}
