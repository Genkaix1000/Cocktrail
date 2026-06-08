"use client";

import { useEffect } from "react";
import type {
  CashSale,
  EventSummary,
  Order,
  Theme,
  CustomTheme,
} from "@cocktrail/shared";
import { API_URL } from "@/config/env";

/**
 * Mapa tipado de handlers de `DomainEvent` para el stream `/api/events`.
 * Cada handler recibe el payload YA parseado y tipado, no el `MessageEvent`.
 */
export type DomainEventHandlers = Partial<{
  "order.created": (data: { order: Order }) => void;
  "order.updated": (data: { order: Order }) => void;
  "cash_sale.added": (data: { cashSale: CashSale }) => void;
  "event.closed": (data: { summary: EventSummary }) => void;
  "theme.changed": (data: {
    theme: Theme;
    customTheme?: CustomTheme | null;
    useLogoUrl?: boolean;
    logoUrl?: string;
    logoSize?: number;
    textLogoValue?: string;
    textLogoSize?: number;
    clubId?: string;
    clubName?: string;
  }) => void;
}>;

type Options = {
  /** Callback invocado en cada `open` del EventSource (inicial + reconexión). */
  onOpen?: () => void;
};

/**
 * Hook que abre una conexión SSE a `/api/events`, parsea los frames y
 * dispara los handlers tipados correspondientes. Cierra la conexión y limpia
 * listeners en el unmount.
 *
 * Los handlers se capturan al primer mount (deps vacías) — usar la forma de
 * función updater de setState dentro para evitar stale-state.
 */
export function useSSE(handlers: DomainEventHandlers, options?: Options): void {
  const { onOpen } = options ?? {};

  useEffect(() => {
    const es = new EventSource(`${API_URL}/api/events`, { withCredentials: true });

    const subscriptions: Array<{
      type: string;
      listener: (e: MessageEvent) => void;
    }> = [];

    for (const [type, handler] of Object.entries(handlers)) {
      if (!handler) continue;
      const listener = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          (handler as (data: unknown) => void)(data);
        } catch {
          // Frame con shape inesperada: ignorar.
        }
      };
      es.addEventListener(type, listener);
      subscriptions.push({ type, listener });
    }

    if (onOpen) es.addEventListener("open", onOpen);

    return () => {
      for (const { type, listener } of subscriptions) {
        es.removeEventListener(type, listener);
      }
      if (onOpen) es.removeEventListener("open", onOpen);
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
