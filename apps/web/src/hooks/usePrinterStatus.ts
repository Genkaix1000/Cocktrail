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
    // Solo reporta estado (el manager no conecta la BLE al refrescar).
    const interval = setInterval(() => void refreshPrinterStatus(), 30000);
    return () => clearInterval(interval);
  }, [refreshPrinterStatus]);

  const pairPrinterDevice = useCallback(async () => {
    setPrinterTestMessage(null);
    try {
      await printerManager.pair();
    } catch (err) {
      // Incluye el entorno sin soporte: el mensaje del manager dice qué usar.
      setPrinterTestMessage(
        err instanceof Error ? err.message : "No se pudo vincular la impresora.",
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
    refreshPrinterStatus,
    pairPrinterDevice,
    printTicket,
    testPrint,
    printerTestMessage,
    reprintTicket,
    printError,
    reprinting,
  };
}
