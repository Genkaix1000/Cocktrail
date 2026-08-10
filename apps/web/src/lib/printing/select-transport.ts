/**
 * Política de selección de transporte de impresión — TODA la prioridad vive acá:
 *
 * 1. APK + USB enchufado → puente USB.
 * 2. APK → BLE nativo S1 (aunque aún no esté vinculada).
 * 3. Chrome: BLE Web si hay S1 vinculada.
 * 4. WebUSB como fallback de escritorio/caja fija.
 */

import { bleS1Transport, getStoredBleDeviceId } from "./transports/ble-s1";
import { hasNativeBleBridge, nativeBleS1Transport } from "./transports/native-ble-s1";
import { nativeBridgeTransport } from "./transports/native-bridge";
import { webUsbTransport } from "./transports/webusb";
import type { PrinterTransport } from "./types";

type NativeUsb = { isConnected: () => boolean };

function nativeUsbConnected(): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (window as Window & { MiBolichePrinter?: NativeUsb }).MiBolichePrinter;
  try {
    return !!bridge?.isConnected?.();
  } catch {
    return false;
  }
}

export function selectTransport(): PrinterTransport | null {
  if (nativeBridgeTransport.isAvailable()) {
    if (nativeUsbConnected()) return nativeBridgeTransport;
    if (hasNativeBleBridge()) return nativeBleS1Transport;
    return nativeBridgeTransport;
  }
  if (bleS1Transport.isAvailable() && getStoredBleDeviceId() !== null) return bleS1Transport;
  if (webUsbTransport.isAvailable()) return webUsbTransport;
  return null;
}
