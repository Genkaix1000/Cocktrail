/**
 * Transporte del puente nativo de la app Android (`window.MiBolichePrinter`):
 * la app maneja el USB, acá solo le pasamos los bytes ESC/POS en base64.
 * En el WebView del APK no hay Web Bluetooth ni WebUSB — este es el único.
 */

import type { PrinterTransport, TransportPrintPayload } from "../types";

type NativePrinter = {
  print: (base64: string) => string;
  isConnected: () => boolean;
  requestPermission: () => void;
};

function nativePrinter(): NativePrinter | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { MiBolichePrinter?: NativePrinter }).MiBolichePrinter;
  return bridge && typeof bridge.print === "function" ? bridge : null;
}

export const nativeBridgeTransport: PrinterTransport = {
  id: "native",

  isAvailable(): boolean {
    return nativePrinter() !== null;
  },

  async isConnected(): Promise<boolean> {
    const native = nativePrinter();
    return !!native?.isConnected();
  },

  /** Pide el permiso USB de Android (lo gestiona la app). */
  async pair(): Promise<void> {
    const native = nativePrinter();
    if (!native) {
      throw new Error("No está el puente nativo. Abrí la app miBoliche Caja.");
    }
    const before = native.isConnected();
    native.requestPermission();
    // Sin device USB el bridge no muestra diálogo: decir la verdad al toque.
    if (!before && !native.isConnected()) {
      throw new Error(
        "APK = solo USB. No hay ticketera enchufada. Para la S1 Bluetooth abrí Chrome con HTTPS (no esta app).",
      );
    }
  },

  async print(payload: TransportPrintPayload): Promise<void> {
    const native = nativePrinter();
    if (!native) {
      throw new Error("No está el puente nativo. Abrí la app miBoliche Caja.");
    }
    const result = native.print(payload.escposBase64);
    if (result !== "ok") {
      throw new Error(result || "Error al imprimir");
    }
  },
};
