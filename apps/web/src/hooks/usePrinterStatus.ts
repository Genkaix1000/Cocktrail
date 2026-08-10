"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { printerManager } from "@/lib/printing/manager";
import type { PrinterSnapshot } from "@/lib/printing/types";
import { printerService } from "@/services/printer.service";
import type { TicketContent } from "@cocktrail/shared";

/** Lo mínimo que necesita el hook de una venta para imprimirla. */
export type PrintableOrder = {
  id?: string;
  ticketData?: string;
  ticketContent?: TicketContent;
};

// Estable para SSR: useSyncExternalStore exige la MISMA referencia en cada
// llamada del server snapshot (si no, re-renderiza infinito en hidratación).
const SERVER_SNAPSHOT: PrinterSnapshot = { phase: "none", connected: false, message: "" };
const getServerSnapshot = (): PrinterSnapshot => SERVER_SNAPSHOT;

const INCOMPLETE_TICKET_MSG =
  "La venta se registró pero el ticket vino incompleto — reimprimí desde el historial.";

/**
 * Adaptador React del printerManager (transportes nativo / Bluetooth S1 /
 * WebUSB con cola secuencial). El estado vive en el manager; acá solo se
 * expone la misma superficie que consumen Sidebar/VentaSection/Historial.
 */
export function usePrinterStatus() {
  const snapshot = useSyncExternalStore(
    printerManager.subscribe,
    printerManager.getSnapshot,
    getServerSnapshot,
  );
  const [printerTestMessage, setPrinterTestMessage] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [reprinting, setReprinting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  // Contrato del hook viejo: null hasta el primer refresh (mensaje vacío =
  // el manager todavía no consultó nada).
  const printerStatus =
    snapshot.message === ""
      ? null
      : { connected: snapshot.connected, message: snapshot.message };

  const refreshPrinterStatus = useCallback(async () => {
    await printerManager.refresh();
  }, []);

  useEffect(() => {
    void refreshPrinterStatus();
    // Detecta rápidamente una S1 dormida o desconectada; el efecto de abajo
    // decide si corresponde reconectarla (refresh nunca abre un selector).
    const interval = setInterval(() => void refreshPrinterStatus(), 3_000);
    return () => clearInterval(interval);
  }, [refreshPrinterStatus]);

  // Una S1 ya vinculada puede dormirse o perder señal. Recuperarla no requiere
  // selector ni interacción del usuario, así que reintentamos de forma acotada.
  useEffect(() => {
    if (snapshot.phase !== "paired" || snapshot.connected) {
      setReconnecting(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = [0, 2_000, 5_000];

    const reconnect = async (attempt: number) => {
      if (cancelled) return;
      setReconnecting(true);
      try {
        await printerManager.connect();
      } catch {
        // El estado queda en paired; el siguiente intento usa el mismo vínculo.
      }
      if (cancelled || printerManager.getSnapshot().connected) {
        if (!cancelled) setReconnecting(false);
        return;
      }
      const nextAttempt = attempt + 1;
      if (nextAttempt >= delays.length) {
        setReconnecting(false);
        return;
      }
      timer = setTimeout(() => void reconnect(nextAttempt), delays[nextAttempt]!);
    };

    void reconnect(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [snapshot.connected, snapshot.phase]);

  const pairPrinterDevice = useCallback(async () => {
    // Nada de setState antes de pair(): en Android Chrome se come el gesto y
    // requestDevice no abre el selector.
    try {
      await printerManager.pair();
      setPrinterTestMessage(null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "No se pudo vincular la impresora.";
      const standalone =
        typeof window !== "undefined" &&
        (window.matchMedia("(display-mode: standalone)").matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true);
      setPrinterTestMessage(
        standalone
          ? `${raw} Si no abrió el selector: Ajustes → apps → miBoliche → Permisos (Dispositivos cercanos / Ubicación) en Permitir. Mientras, vinculá desde la pestaña de Chrome (misma URL) y volvé a la PWA.`
          : raw,
      );
    }
  }, []);

  /** Despierta la impresora ya vinculada (la Bluetooth se apaga sola). */
  const connectPrinter = useCallback(async () => {
    try {
      await printerManager.connect();
      setPrinterTestMessage(null);
    } catch (err) {
      setPrinterTestMessage(
        err instanceof Error ? err.message : "No se pudo conectar con la impresora.",
      );
    }
  }, []);

  const printTicket = useCallback(async (result: PrintableOrder) => {
    setPrintError(null);
    const { ticketData, ticketContent } = result;
    if (!ticketData || !ticketContent) {
      setPrintError(INCOMPLETE_TICKET_MSG);
      throw new Error(INCOMPLETE_TICKET_MSG);
    }
    try {
      await printerManager.print(
        { escposBase64: ticketData, ticketContent },
        { orderId: result.id },
      );
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Error al imprimir.");
      throw err;
    }
  }, []);

  const testPrint = useCallback(async () => {
    setPrinterTestMessage(null);
    try {
      const payload = await printerService.test();
      await printerManager.print(
        { escposBase64: payload.data, ticketContent: payload.ticketContent },
        { label: "ticket de prueba" },
      );
      setPrinterTestMessage(payload.message);
    } catch (err) {
      setPrinterTestMessage(
        err instanceof Error ? err.message : "Error al imprimir la prueba.",
      );
    }
  }, []);

  const reprintTicket = useCallback(async (orderId: string) => {
    setReprinting(true);
    setPrintError(null);
    try {
      const payload = await printerService.reprint(orderId);
      await printerManager.print(
        { escposBase64: payload.data, ticketContent: payload.ticketContent },
        { orderId },
      );
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Error al reimprimir.");
    } finally {
      setReprinting(false);
    }
  }, []);

  return {
    printerStatus,
    printerPaired: snapshot.phase === "paired" || snapshot.phase === "connected",
    refreshPrinterStatus,
    pairPrinterDevice,
    connectPrinter,
    reconnecting,
    printTicket,
    testPrint,
    printerTestMessage,
    clearPrinterTestMessage: () => setPrinterTestMessage(null),
    reprintTicket,
    printError,
    reprinting,
  };
}
