/**
 * Política de selección de transporte de impresión — TODA la prioridad vive acá:
 *
 * 1. Puente nativo del APK (en ese WebView no hay Web Bluetooth ni WebUSB).
 * 2. BLE si hay una S1 vinculada (el flujo comandera: tablet + impresora portátil).
 * 3. WebUSB como fallback de escritorio/caja fija.
 */

import { bleS1Transport, getStoredBleDeviceId } from "./transports/ble-s1";
import { nativeBridgeTransport } from "./transports/native-bridge";
import { webUsbTransport } from "./transports/webusb";
import type { PrinterTransport } from "./types";

export { getStoredBleDeviceId };

export function selectTransport(): PrinterTransport | null {
  // Seam futuro: una preferencia explícita (ej. localStorage
  // "cocktrail.printer-transport") se leería acá, antes de la prioridad fija.
  if (nativeBridgeTransport.isAvailable()) return nativeBridgeTransport;
  if (bleS1Transport.isAvailable() && getStoredBleDeviceId() !== null) return bleS1Transport;
  if (webUsbTransport.isAvailable()) return webUsbTransport;
  return null;
}
