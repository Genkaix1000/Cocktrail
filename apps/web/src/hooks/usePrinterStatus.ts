"use client";

import { useCallback, useEffect, useState } from "react";

import { printerService } from "@/services/printer.service";

/**
 * Estado de la impresora térmica de caja: polling de conexión (cada 30s),
 * impresión de prueba y reimpresión de tickets.
 *
 * Extraído de CajaClient.tsx — vive en el shell porque lo consume tanto el
 * sidebar (printerStatus/testPrint/printerTestMessage) como el ticket de
 * éxito de VentaSection y el popup de detalle de Historial
 * (reprintTicket/printError/reprinting). Se agrupa todo en un solo hook de
 * "impresora" en vez de partir reprintTicket hacia useCheckout: es lógica de
 * impresión, no de cobro, y así el shell puede compartir un único hook con
 * ambos consumidores sin duplicar estado.
 */
export function usePrinterStatus() {
  const [printerStatus, setPrinterStatus] = useState<{ connected: boolean; message: string } | null>(null);
  const [printerTestMessage, setPrinterTestMessage] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [reprinting, setReprinting] = useState(false);

  const refreshPrinterStatus = useCallback(async () => {
    try {
      const status = await printerService.getStatus();
      setPrinterStatus(status);
    } catch {
      setPrinterStatus({ connected: false, message: "No se pudo consultar el estado de la impresora." });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPrinterStatus();
    const interval = setInterval(refreshPrinterStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshPrinterStatus]);

  const testPrint = useCallback(async () => {
    setPrinterTestMessage(null);
    try {
      const result = await printerService.test();
      setPrinterTestMessage(result.message);
    } catch (err) {
      setPrinterTestMessage(err instanceof Error ? err.message : "Error al imprimir la prueba.");
    } finally {
      refreshPrinterStatus();
    }
  }, [refreshPrinterStatus]);

  const reprintTicket = useCallback(async (orderId: string) => {
    setReprinting(true);
    setPrintError(null);
    try {
      const result = await printerService.reprint(orderId);
      if (!result.success) {
        setPrintError(result.message || "No se pudo imprimir el ticket.");
      }
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Error al reimprimir.");
    } finally {
      setReprinting(false);
    }
  }, []);

  return {
    printerStatus,
    refreshPrinterStatus,
    testPrint,
    printerTestMessage,
    reprintTicket,
    printError,
    reprinting,
  };
}

