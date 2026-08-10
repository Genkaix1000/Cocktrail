/**
 * Reporte de diagnóstico de impresión — texto plano para copiar desde la PWA.
 */

import { printerManager } from "./manager";
import { getBleChunkSizeOverride, getStoredBleDeviceId } from "./transports/ble-s1";
import { nativeBridgeTransport } from "./transports/native-bridge";
import { webUsbTransport } from "./transports/webusb";
import { selectTransport } from "./select-transport";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function buildPrinterDebugReport(): Promise<string> {
  const lines: string[] = ["=== miBoliche impresora debug ==="];

  if (typeof window === "undefined") {
    lines.push("window: undefined (SSR)");
    return lines.join("\n");
  }

  const nav = navigator as Navigator & {
    bluetooth?: {
      getAvailability?: () => Promise<boolean>;
      getDevices?: () => Promise<{ id: string; name?: string }[]>;
    };
    usb?: unknown;
    userAgentData?: { platform?: string; mobile?: boolean };
  };

  lines.push(`href: ${window.location.href}`);
  lines.push(`origin: ${window.location.origin}`);
  lines.push(`secureContext: ${String(window.isSecureContext)}`);
  lines.push(`standalone: ${String(isStandalone())}`);
  lines.push(
    `displayMode: ${
      window.matchMedia("(display-mode: standalone)").matches
        ? "standalone"
        : window.matchMedia("(display-mode: browser)").matches
          ? "browser"
          : "other"
    }`,
  );
  lines.push(`userAgent: ${navigator.userAgent}`);

  const bleApi = nav.bluetooth != null;
  lines.push(`navigator.bluetooth: ${bleApi ? "present" : "MISSING"}`);
  if (bleApi && typeof nav.bluetooth?.getAvailability === "function") {
    try {
      lines.push(`bluetooth.getAvailability: ${String(await nav.bluetooth.getAvailability())}`);
    } catch (err) {
      lines.push(`bluetooth.getAvailability ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    lines.push("bluetooth.getAvailability: n/a");
  }

  const storedId = getStoredBleDeviceId();
  lines.push(`localStorage ble-id: ${storedId ?? "(none)"}`);
  lines.push(`ble-chunk: ${getBleChunkSizeOverride() ?? "(default 64)"}`);

  if (bleApi && typeof nav.bluetooth?.getDevices === "function") {
    try {
      const devices = await nav.bluetooth.getDevices();
      lines.push(`bluetooth.getDevices count: ${devices.length}`);
      for (const d of devices.slice(0, 5)) {
        lines.push(`  - id=${d.id} name=${d.name ?? "(no name)"}`);
      }
    } catch (err) {
      lines.push(`bluetooth.getDevices ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    lines.push("bluetooth.getDevices: n/a (API ausente o sin new-permissions-backend)");
  }

  lines.push(`navigator.usb: ${nav.usb != null ? "present" : "MISSING"}`);
  lines.push(`native MiBolichePrinter: ${String(nativeBridgeTransport.isAvailable())}`);
  lines.push(`webusb.isAvailable: ${String(webUsbTransport.isAvailable())}`);

  const selected = selectTransport();
  lines.push(`selectTransport: ${selected?.id ?? "(null)"}`);

  const snap = printerManager.getSnapshot();
  lines.push(`snapshot.phase: ${snap.phase}`);
  lines.push(`snapshot.connected: ${String(snap.connected)}`);
  lines.push(`snapshot.transportId: ${snap.transportId ?? "(none)"}`);
  lines.push(`snapshot.message: ${snap.message || "(empty)"}`);

  // Permisos web (si el browser los expone).
  if (navigator.permissions?.query) {
    for (const name of ["bluetooth", "geolocation"] as const) {
      try {
        // bluetooth no está en todos los typings
        const status = await navigator.permissions.query({ name: name as PermissionName });
        lines.push(`permissions.${name}: ${status.state}`);
      } catch {
        lines.push(`permissions.${name}: (query no soportada)`);
      }
    }
  }

  lines.push(`generatedAt: ${new Date().toISOString()}`);
  return lines.join("\n");
}
