/**
 * Transporte WebUSB (Chrome + HTTPS / flag de origen inseguro): ticketera
 * térmica USB recibiendo ESC/POS texto directo.
 *
 * ponytail: un solo device; si hay varias ticketeras, filtrar por vendorId.
 */

import type { PrinterTransport, TransportPrintPayload } from "../types";

// Tipos mínimos de WebUSB: no están en lib.dom estándar.
type UsbOutEndpoint = { direction: "in" | "out"; endpointNumber: number };
type UsbInterface = {
  interfaceNumber: number;
  alternate: { endpoints: UsbOutEndpoint[] };
};
type UsbConfiguration = { interfaces: UsbInterface[] };
type UsbDevice = {
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (n: number) => Promise<void>;
  claimInterface: (n: number) => Promise<void>;
  transferOut: (endpointNumber: number, data: BufferSource) => Promise<unknown>;
  configuration: UsbConfiguration | null;
};
type UsbApi = {
  requestDevice: (options: { filters: object[] }) => Promise<UsbDevice>;
  getDevices: () => Promise<UsbDevice[]>;
};

function usb(): UsbApi | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { usb?: UsbApi }).usb ?? null;
}

async function getPairedPrinter(): Promise<UsbDevice | null> {
  const api = usb();
  if (!api) return null;
  const devices = await api.getDevices();
  return devices[0] ?? null;
}

function decodeBase64(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const webUsbTransport: PrinterTransport = {
  id: "webusb",

  isAvailable(): boolean {
    return usb() !== null;
  },

  async isConnected(): Promise<boolean> {
    return (await getPairedPrinter()) !== null;
  },

  /** Selector WebUSB de Chrome (necesita gesto de usuario). */
  async pair(): Promise<void> {
    const api = usb();
    if (!api) {
      throw new Error("Este navegador no tiene WebUSB. Abrí Chrome con HTTPS.");
    }
    await api.requestDevice({ filters: [] });
  },

  async print(payload: TransportPrintPayload): Promise<void> {
    const device = await getPairedPrinter();
    if (!device) {
      throw new Error("No hay impresora vinculada. Tocá «Vincular impresora».");
    }

    const data = decodeBase64(payload.escposBase64);
    await device.open();
    try {
      if (!device.configuration) {
        await device.selectConfiguration(1);
      }
      const iface =
        device.configuration!.interfaces.find((i) =>
          i.alternate.endpoints.some((e) => e.direction === "out"),
        ) ?? device.configuration!.interfaces[0];
      if (!iface) throw new Error("La impresora no expone una interfaz USB usable.");

      await device.claimInterface(iface.interfaceNumber);
      const ep = iface.alternate.endpoints.find((e) => e.direction === "out");
      if (!ep) throw new Error("La impresora no tiene endpoint de salida USB.");

      await device.transferOut(
        ep.endpointNumber,
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
      );
    } finally {
      try {
        await device.close();
      } catch {
        // ignore close errors
      }
    }
  },
};
