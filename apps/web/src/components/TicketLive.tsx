"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearActiveOrder } from "@/lib/activeOrder";
import { useSSE } from "@/lib/useSSE";
import { eventsService } from "@/services/events.service";
import type { Order } from "@cocktrail/shared";
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
      const state = await eventsService.getState();
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

  // Pedir permiso de notificación al montar. Si el cliente lo deniega o el
  // browser no soporta la API, fallback a vibración + title flash sigue vivo.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {
        // Algunos browsers tiran si no hay user gesture — ignorar.
      });
    }
  }, []);

  // Vibración + title flash + notificación solo en la TRANSICIÓN a listo
  // (no al renderear si ya viene listo desde el server).
  useEffect(() => {
    if (order.status === "listo" && prevStatus.current !== "listo") {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      document.title = "🟢 Tu trago está listo — Cocktrail";

      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification(`🟢 Tu trago #${order.displayNumber} está listo`, {
            body: "Retiralo en la barra mostrando esta pantalla.",
            tag: `cocktrail-${order.token}`,
          });
        } catch {
          // Algunos browsers (Safari iOS sin PWA) tiran — el flash + vibración cubren.
        }
      }
    }
    prevStatus.current = order.status;
  }, [order.status, order.displayNumber, order.token]);

  // Al entrar a estado terminal, soltar el localStorage para que /carta
  // no muestre más el pill de pedido en curso.
  useEffect(() => {
    if (order.status === "entregado" || order.status === "cancelado") {
      clearActiveOrder();
    }
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
