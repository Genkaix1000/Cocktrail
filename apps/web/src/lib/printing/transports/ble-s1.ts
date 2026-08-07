/**
 * Transporte Web Bluetooth para la impresora térmica Lujiang S1 (comandera).
 * El ticket viaja como raster 384px envuelto en el protocolo propietario S1
 * (ver s1-protocol.ts) — la S1 no imprime ESC/POS texto por BLE.
 */

import { downsampleRowPairs, renderTicketBitmap } from "../raster";
import {
  buildS1Sequence,
  MAX_CHUNK_BYTES,
  MIN_CHUNK_BYTES,
  S1_NAME_PREFIX,
  S1_SERVICE,
  S1_WRITE_CHARACTERISTIC,
} from "../s1-protocol";
import type { PrinterTransport, TransportPrintPayload } from "../types";

// Tipos mínimos de Web Bluetooth: no están en lib.dom estándar.
type BluetoothCharacteristic = {
  writeValueWithoutResponse: (data: Uint8Array) => Promise<void>;
};
type BluetoothService = {
  getCharacteristic: (id: number) => Promise<BluetoothCharacteristic>;
};
type BluetoothGattServer = {
  connected: boolean;
  connect: () => Promise<BluetoothGattServer>;
  disconnect: () => void;
  getPrimaryService: (id: number) => Promise<BluetoothService>;
};
type BluetoothDevice = {
  id: string;
  name?: string;
  gatt?: BluetoothGattServer;
  addEventListener: (type: "gattserverdisconnected", listener: () => void) => void;
};
type BluetoothApi = {
  requestDevice: (options: {
    filters: { namePrefix: string }[];
    optionalServices: number[];
  }) => Promise<BluetoothDevice>;
  /** Chrome la expone detrás de un flag/versión: puede no existir. */
  getDevices?: () => Promise<BluetoothDevice[]>;
};

export const BLE_PRINTER_ID_KEY = "cocktrail.ble-printer-id";
export const BLE_CHUNK_KEY = "cocktrail.ble-chunk";

const CONNECT_TIMEOUT_MS = 5000;

/**
 * Override opcional del tamaño de chunk BLE. El MTU real depende del
 * dispositivo y Web Bluetooth no lo expone, así que el default es el mínimo
 * seguro (20); en una tablet ya probada se puede subir para ganar velocidad.
 * Valores inválidos (no entero o fuera de [20, 512]) se ignoran.
 */
export function getBleChunkSizeOverride(): number | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(BLE_CHUNK_KEY);
    if (raw === null) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < MIN_CHUNK_BYTES || n > MAX_CHUNK_BYTES) return undefined;
    return n;
  } catch {
    return undefined;
  }
}

function bluetooth(): BluetoothApi | null {
  if (typeof navigator === "undefined" || typeof window === "undefined") return null;
  // Web Bluetooth solo funciona en contexto seguro (HTTPS/localhost).
  if (window.isSecureContext === false) return null;
  return (navigator as Navigator & { bluetooth?: BluetoothApi }).bluetooth ?? null;
}

export function getStoredBleDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(BLE_PRINTER_ID_KEY);
  } catch {
    return null;
  }
}

// Cache del device/GATT: reconectar es caro y el prompt de permisos no se
// puede repetir por cada impresión.
let cachedDevice: BluetoothDevice | null = null;
let cachedServer: BluetoothGattServer | null = null;
let cachedChar: BluetoothCharacteristic | null = null;
let connectPromise: Promise<BluetoothCharacteristic> | null = null;
let onDisconnected: (() => void) | null = null;

/** El manager se registra acá para refrescar su snapshot cuando el GATT se cae. */
export function setBleDisconnectListener(listener: (() => void) | null): void {
  onDisconnected = listener;
}

function adoptDevice(device: BluetoothDevice): void {
  if (cachedDevice === device) return;
  cachedDevice = device;
  cachedServer = null;
  cachedChar = null;
  device.addEventListener("gattserverdisconnected", () => {
    cachedServer = null;
    cachedChar = null;
    onDisconnected?.();
  });
}

/** Re-obtiene el device vinculado SIN prompt (getDevices puede no existir). */
async function getDeviceWithoutPrompt(): Promise<BluetoothDevice | null> {
  const id = getStoredBleDeviceId();
  if (!id) return null;
  if (cachedDevice?.id === id) return cachedDevice;
  const api = bluetooth();
  if (!api?.getDevices) return null;
  try {
    const devices = await api.getDevices();
    const device = devices.find((d) => d.id === id) ?? null;
    if (device) adoptDevice(device);
    return device;
  } catch {
    return null;
  }
}

function connectWithTimeout(gatt: BluetoothGattServer): Promise<BluetoothGattServer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("La impresora Bluetooth no responde. ¿Está encendida?"));
    }, CONNECT_TIMEOUT_MS);
    gatt.connect().then(
      (server) => {
        clearTimeout(timer);
        resolve(server);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

async function doConnect(): Promise<BluetoothCharacteristic> {
  const device = await getDeviceWithoutPrompt();
  if (!device?.gatt) {
    throw new Error("No hay impresora Bluetooth vinculada. Tocá «Vincular impresora».");
  }
  let server: BluetoothGattServer;
  try {
    server = await connectWithTimeout(device.gatt);
  } catch {
    // Quirk conocido de Chrome Android: tras una desconexión larga el primer
    // connect() cuelga o falla; el segundo intento suele entrar.
    server = await connectWithTimeout(device.gatt);
  }
  cachedServer = server;
  const service = await server.getPrimaryService(S1_SERVICE);
  cachedChar = await service.getCharacteristic(S1_WRITE_CHARACTERISTIC);
  return cachedChar;
}

/** Serializado: NUNCA dos gatt.connect() concurrentes (Chrome se cuelga). */
function ensureConnected(): Promise<BluetoothCharacteristic> {
  if (cachedChar && cachedServer?.connected) return Promise.resolve(cachedChar);
  if (connectPromise) return connectPromise;
  connectPromise = doConnect().finally(() => {
    connectPromise = null;
  });
  return connectPromise;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const bleS1Transport: PrinterTransport = {
  id: "ble-s1",

  isAvailable(): boolean {
    return bluetooth() !== null;
  },

  /** Estado del GATT cacheado — NO conecta (eso pasa dentro del job de impresión). */
  async isConnected(): Promise<boolean> {
    return !!cachedServer?.connected;
  },

  async pair(): Promise<void> {
    const api = bluetooth();
    if (!api) {
      throw new Error("Este navegador no tiene Web Bluetooth. Abrí Chrome con HTTPS.");
    }
    const device = await api.requestDevice({
      filters: [{ namePrefix: S1_NAME_PREFIX }],
      optionalServices: [S1_SERVICE],
    });
    try {
      window.localStorage.setItem(BLE_PRINTER_ID_KEY, device.id);
    } catch {
      // sin localStorage igual queda el cache en memoria para esta sesión
    }
    adoptDevice(device);
  },

  /** Despierta la impresora ya vinculada, sin volver a pedir el dispositivo. */
  async connect(): Promise<void> {
    await ensureConnected();
  },

  async print(payload: TransportPrintPayload): Promise<void> {
    const characteristic = await ensureConnected();
    // Pipeline validado en el gate T1: render a resolución completa →
    // downsample m=2 con OR → GS v 0 doble alto (mitad de datos, un bloque).
    const bitmap = downsampleRowPairs(renderTicketBitmap(payload.ticketContent));
    const steps = buildS1Sequence(bitmap, {
      chunkSize: getBleChunkSizeOverride(),
      mode: "doubleHeight",
    });
    for (const step of steps) {
      await characteristic.writeValueWithoutResponse(step.bytes);
      if (step.delayAfterMs > 0) await sleep(step.delayAfterMs);
    }
  },
};

/** Solo para tests: limpia el estado del módulo entre casos. */
export function __resetBleTransportForTests(): void {
  cachedDevice = null;
  cachedServer = null;
  cachedChar = null;
  connectPromise = null;
  onDisconnected = null;
}
