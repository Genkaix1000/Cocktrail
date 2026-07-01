"use client";

import { useCallback, useEffect, useState } from "react";

import { useScannerInput } from "@/hooks/useScannerInput";
import { ticketsService } from "@/services/tickets.service";
import type { Order } from "@cocktrail/shared";

type FlashData = {
  type: "success" | "duplicate" | "error";
  message: string;
  displayNumber?: number;
  items?: Array<{ name: string; qty: number }>;
};

interface UseOfflineScanQueueOptions {
  /** Código de la estación de barra que hace el canje (para auditoría del ticket). */
  barCode: string;
  /** Dispara el overlay de feedback visual — vive en el shell (BarraClient). */
  triggerFlash: (data: FlashData) => void;
  /** Refresca la lista de pedidos pendientes tras un canje o una sincronización exitosa. */
  fetchPendingOrders: () => void;
  /** Reporta un canje entregado con éxito para que el shell actualice `recentScans`/`deliveredCount`. */
  onRedeemed: (order: Order) => void;
}

function isNetworkError(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    (err instanceof Error &&
      (err.message.includes("Failed to fetch") ||
        err.message.includes("NetworkError") ||
        err.message.includes("network")))
  );
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

/**
 * Cola de canjes offline de la estación de barra: encola escaneos cuando no hay
 * conexión (o la red falla), reintenta cada 10s y al volver el `online` del
 * navegador, y expone `handleScan` (consumido por el scanner de hardware vía
 * `useScannerInput` y por el modal de canje manual del shell).
 *
 * Extraído de BarraClient.tsx como unidad atómica — mezcla localStorage,
 * `navigator.onLine`/`navigator.vibrate` y un `setInterval` de reintento, así
 * que no se descompone en piezas más chicas (ver docs/specs/auditoria-web.md,
 * tarea 9).
 *
 * `recentScans`/`deliveredCount` NO viven acá: los mutan también los handlers
 * de SSE (`order.updated`, `event.closed`) que quedan en el shell. Este hook
 * solo *reporta* cada canje exitoso vía `onRedeemed`; quien escribe a
 * localStorage y recorta al límite es siempre el shell (mismo criterio para
 * el canje directo y para los handlers de SSE, sin duplicar esa lógica acá).
 */
export function useOfflineScanQueue({
  barCode,
  triggerFlash,
  fetchPendingOrders,
  onRedeemed,
}: UseOfflineScanQueueOptions) {
  const [offlineQueue, setOfflineQueue] = useState<string[]>([]);

  // Carga inicial de la cola offline persistida
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedQueue = localStorage.getItem("cocktrail_offline_scans");

    setTimeout(() => {
      if (savedQueue) {
        try {
          setOfflineQueue(JSON.parse(savedQueue));
        } catch {}
      }
    }, 0);
  }, []);

  const enqueue = useCallback((code: string) => {
    setOfflineQueue((prev) => {
      if (prev.includes(code)) return prev;
      const next = [...prev, code];
      localStorage.setItem("cocktrail_offline_scans", JSON.stringify(next));
      return next;
    });
  }, []);

  // Scan processor handler con soporte offline
  const handleScan = useCallback(
    async (code: string, method: "scan" | "manual" = "scan"): Promise<boolean> => {
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

      if (isOffline) {
        vibrate([100, 50, 100]);
        triggerFlash({
          type: "duplicate",
          message: "Offline: Guardado en la cola local de pendientes.",
        });
        enqueue(code);
        return false;
      }

      try {
        const res = await ticketsService.redeem(code, { barCode, method });
        if (res.success) {
          vibrate(200);
          const methodLabel = method === "manual" ? " (manual)" : "";
          triggerFlash({
            type: "success",
            message: `¡Pedido #${res.order.displayNumber} entregado con éxito${methodLabel}!`,
            displayNumber: res.order.displayNumber,
            items: res.order.items,
          });

          onRedeemed(res.order);
          fetchPendingOrders();
          return true;
        }
        return false;
      } catch (err) {
        if (isNetworkError(err)) {
          vibrate([100, 50, 100]);
          triggerFlash({
            type: "duplicate",
            message: "Red inestable: guardado en la cola local de pendientes.",
          });
          enqueue(code);
          return false;
        }

        let msg = "Error al procesar ticket";
        let type: "error" | "duplicate" = "error";
        let vibratePattern: number | number[] = 400;

        if (err instanceof Error) {
          msg = err.message;
          if (err.message.toLowerCase().includes("canjeado")) {
            type = "duplicate";
            vibratePattern = [100, 50, 100];
          }
        }

        vibrate(vibratePattern);
        triggerFlash({ type, message: msg });
        return false;
      }
    },
    [barCode, fetchPendingOrders, triggerFlash, enqueue, onRedeemed],
  );

  // Hook para capturar la entrada del lector de código de barras
  useScannerInput({
    onScan: handleScan,
  });

  // Auto-sync de canjes offline al recuperar conexión
  useEffect(() => {
    let active = true;

    const syncQueue = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      const saved = localStorage.getItem("cocktrail_offline_scans");
      if (!saved) return;

      let queue: string[] = [];
      try {
        queue = JSON.parse(saved);
      } catch {
        return;
      }

      if (queue.length === 0) return;

      console.log(`[sync] Sincronizando ${queue.length} canjes offline...`);
      const remaining: string[] = [];

      for (const code of queue) {
        if (!active) return;
        try {
          await ticketsService.redeem(code);
        } catch (err) {
          if (isNetworkError(err)) {
            remaining.push(code);
          }
        }
      }

      if (active) {
        setOfflineQueue(remaining);
        localStorage.setItem("cocktrail_offline_scans", JSON.stringify(remaining));
        if (remaining.length === 0 && queue.length > 0) {
          triggerFlash({
            type: "success",
            message: "Sincronizados con éxito todos los canjes offline.",
          });
          fetchPendingOrders();
        }
      }
    };

    window.addEventListener("online", syncQueue);
    const interval = setInterval(syncQueue, 10000);
    syncQueue();

    return () => {
      active = false;
      window.removeEventListener("online", syncQueue);
      clearInterval(interval);
    };
  }, [fetchPendingOrders, triggerFlash]);

  return {
    offlineQueue,
    handleScan,
  };
}

export type UseOfflineScanQueueResult = ReturnType<typeof useOfflineScanQueue>;
