/**
 * Transporte del puente nativo del APK (`window.MiBolichePrinter`):
 * USB ESC/POS. La S1 Bluetooth va por native-ble-s1.
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
    if (!before && !native.isConnected()) {
      throw new Error("No hay ticketera USB enchufada.");
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
