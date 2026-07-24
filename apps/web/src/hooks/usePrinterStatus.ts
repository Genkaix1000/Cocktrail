"use client";

import { useCallback, useEffect, useState } from "react";

import {
  isPrinterBackendAvailable,
  isPrinterConnected,
  pairPrinter,
  printEscPos,
} from "@/lib/webusb-printer";
import { printerService } from "@/services/printer.service";

/**
 * Estado de la impresora térmica de caja: vínculo USB en ESTE dispositivo
 * (app Android nativa o WebUSB), impresión de prueba y reimpresión.
 * El server solo arma bytes ESC/POS.
 */
export function usePrinterStatus() {
  const [printerStatus, setPrinterStatus] = useState<{ connected: boolean; message: string } | null>(
    null,
  );
  const [printerTestMessage, setPrinterTestMessage] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [reprinting, setReprinting] = useState(false);

  const refreshPrinterStatus = useCallback(async () => {
    if (!isPrinterBackendAvailable()) {
      setPrinterStatus({
        connected: false,
        message: "Abrí la app miBoliche Caja (o Chrome con WebUSB/HTTPS).",
      });
      return;
    }
    try {
      const connected = await isPrinterConnected();
      setPrinterStatus(
        connected
          ? { connected: true, message: "Impresora vinculada en este dispositivo" }
          : { connected: false, message: "Sin impresora vinculada en este dispositivo" },
      );
    } catch {
      setPrinterStatus({ connected: false, message: "No se pudo consultar la impresora USB." });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPrinterStatus();
    const interval = setInterval(refreshPrinterStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshPrinterStatus]);

  const pairPrinterDevice = useCallback(async () => {
    setPrinterTestMessage(null);
    try {
      await pairPrinter();
      // El diálogo nativo es async; refrescar un poco después.
      setTimeout(() => refreshPrinterStatus(), 800);
      setPrinterTestMessage("Pedí permiso USB — aceptá «Usar siempre» si aparece.");
    } catch (err) {
      setPrinterTestMessage(err instanceof Error ? err.message : "No se pudo vincular la impresora.");
    } finally {
      refreshPrinterStatus();
    }
  }, [refreshPrinterStatus]);

  const printTicketData = useCallback(async (base64: string) => {
    setPrintError(null);
    try {
      await printEscPos(base64);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al imprimir.";
      setPrintError(message);
      throw err;
    }
  }, []);

  const testPrint = useCallback(async () => {
    setPrinterTestMessage(null);
    try {
      const payload = await printerService.test();
      await printEscPos(payload.data);
      setPrinterTestMessage(payload.message);
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
      const payload = await printerService.reprint(orderId);
      await printEscPos(payload.data);
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
    printTicketData,
    testPrint,
    printerTestMessage,
    reprintTicket,
    printError,
    reprinting,
  };
}
