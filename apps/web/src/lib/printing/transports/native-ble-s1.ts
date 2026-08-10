/**
 * Transporte BLE S1 vía puente nativo del APK (`MiBolichePrinter.ble*`).
 * Raster + protocolo S1 viven en JS; Android solo hace GATT write.
 */

import { renderTicketBitmap } from "../raster";
import { buildS1Sequence } from "../s1-protocol";
import type { PrinterTransport, TransportPrintPayload } from "../types";

// El GATT nativo no negocia el MTU, así que conserva el mínimo BLE (23 - 3).
// Web Bluetooth sí fue validado con 64 bytes y mantiene su propio override.
export const NATIVE_BLE_CHUNK_BYTES = 20;

type NativeBleBridge = {
  blePair: () => string;
  bleIsPaired: () => boolean;
  bleIsConnected: () => boolean;
  bleConnect: () => string;
  blePrintSteps: (json: string) => string;
  isConnected?: () => boolean;
  print?: (base64: string) => string;
  requestPermission?: () => void;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function nativeBle(): NativeBleBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { MiBolichePrinter?: NativeBleBridge }).MiBolichePrinter;
  if (!bridge || typeof bridge.blePair !== "function") return null;
  return bridge;
}

export function hasNativeBleBridge(): boolean {
  return nativeBle() !== null;
}

export const nativeBleS1Transport: PrinterTransport = {
  id: "native-ble-s1",

  isAvailable(): boolean {
    return hasNativeBleBridge();
  },

  async isConnected(): Promise<boolean> {
    const bridge = nativeBle();
    return !!bridge?.bleIsConnected();
  },

  async pair(): Promise<void> {
    const bridge = nativeBle();
    if (!bridge) throw new Error("No está el puente nativo. Abrí la app miBoliche Caja.");
    const result = bridge.blePair();
    if (result !== "ok") throw new Error(result || "No se pudo vincular la impresora Bluetooth.");
  },

  async connect(): Promise<void> {
    const bridge = nativeBle();
    if (!bridge) throw new Error("No está el puente nativo. Abrí la app miBoliche Caja.");
    const result = bridge.bleConnect();
    if (result !== "ok") throw new Error(result || "No se pudo conectar la impresora Bluetooth.");
  },

  async print(payload: TransportPrintPayload): Promise<void> {
    const bridge = nativeBle();
    if (!bridge) throw new Error("No está el puente nativo. Abrí la app miBoliche Caja.");
    const bitmap = renderTicketBitmap(payload.ticketContent);
    const steps = buildS1Sequence(bitmap, { chunkSize: NATIVE_BLE_CHUNK_BYTES });
    const json = JSON.stringify(
      steps.map((step) => ({
        b: bytesToBase64(step.bytes),
        d: step.delayAfterMs,
      })),
    );
    const result = bridge.blePrintSteps(json);
    if (result !== "ok") throw new Error(result || "Error al imprimir por Bluetooth.");
  },
};
