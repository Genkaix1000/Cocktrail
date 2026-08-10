/**
 * Manager de impresión: framework-agnóstico (el hook React lo adapta con
 * useSyncExternalStore), singleton del módulo. Mantiene un snapshot inmutable
 * del estado y coordina transporte + cola secuencial.
 *
 * Honestidad de estado: "paired" = vinculada pero GATT sin verificar;
 * "connected" solo cuando el transporte lo confirmó.
 */

import { createPrintQueue } from "./queue";
import { selectTransport } from "./select-transport";
import {
  bleS1Transport,
  getStoredBleDeviceId,
  setBleDisconnectListener,
} from "./transports/ble-s1";
import { hasNativeBleBridge, nativeBleS1Transport } from "./transports/native-ble-s1";
import type {
  PrinterSnapshot,
  PrinterTransport,
  TransportPrintPayload,
} from "./types";

export const NO_SUPPORT_MESSAGE =
  "Sin Web Bluetooth. En Chrome → chrome://flags activá “Experimental Web Platform features” y “Web Bluetooth New Permissions Backend”, reiniciá Chrome y volvé a abrir la PWA.";
const NOT_PAIRED_MESSAGE = "Sin impresora vinculada. Tocá «Vincular impresora».";

export type PrintMeta = { orderId?: string; label?: string };

export type PrinterManager = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): PrinterSnapshot;
  /** Recalcula transporte + estado de conexión. NO conecta la BLE. */
  refresh(): Promise<void>;
  pair(): Promise<void>;
  /** Reconecta a la impresora ya vinculada (la Bluetooth se apaga sola). */
  connect(): Promise<void>;
  print(payload: TransportPrintPayload, meta?: PrintMeta): Promise<void>;
};

type ManagerDeps = {
  selectTransport: () => PrinterTransport | null;
  bleTransport: PrinterTransport;
  getStoredBleDeviceId: () => string | null;
  setBleDisconnectListener: (listener: (() => void) | null) => void;
  hasNativeBle: () => boolean;
  nativeBleIsPaired: () => boolean;
};

const INITIAL_SNAPSHOT: PrinterSnapshot = {
  phase: "none",
  connected: false,
  message: "",
};

function sameSnapshot(a: PrinterSnapshot, b: PrinterSnapshot): boolean {
  return (
    a.phase === b.phase &&
    a.connected === b.connected &&
    a.message === b.message &&
    a.transportId === b.transportId
  );
}

function nativeBleIsPaired(): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (window as Window & { MiBolichePrinter?: { bleIsPaired?: () => boolean } })
    .MiBolichePrinter;
  try {
    return !!bridge?.bleIsPaired?.();
  } catch {
    return false;
  }
}

export function createPrinterManager(overrides: Partial<ManagerDeps> = {}): PrinterManager {
  const deps: ManagerDeps = {
    selectTransport,
    bleTransport: bleS1Transport,
    getStoredBleDeviceId,
    setBleDisconnectListener,
    hasNativeBle: hasNativeBleBridge,
    nativeBleIsPaired,
    ...overrides,
  };

  const queue = createPrintQueue();
  const listeners = new Set<() => void>();
  let snapshot: PrinterSnapshot = INITIAL_SNAPSHOT;

  function setSnapshot(next: PrinterSnapshot): void {
    // Misma referencia si no cambió nada: useSyncExternalStore no re-renderiza.
    if (sameSnapshot(snapshot, next)) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  async function refresh(): Promise<void> {
    if (typeof window === "undefined") return;
    // Mientras imprime, el estado lo maneja la cola — no lo pisamos.
    if (queue.getStatus().state === "printing") return;

    const transport = deps.selectTransport();
    if (!transport) {
      if (deps.bleTransport.isAvailable() || deps.hasNativeBle()) {
        setSnapshot({ phase: "none", connected: false, message: NOT_PAIRED_MESSAGE });
      } else {
        setSnapshot({ phase: "unsupported", connected: false, message: NO_SUPPORT_MESSAGE });
      }
      return;
    }

    let connected = false;
    try {
      connected = await transport.isConnected();
    } catch {
      connected = false;
    }

    if (connected) {
      setSnapshot({
        phase: "connected",
        connected: true,
        message: "Impresora conectada.",
        transportId: transport.id,
      });
    } else if (transport.id === "ble-s1" && deps.getStoredBleDeviceId()) {
      setSnapshot({
        phase: "paired",
        connected: false,
        message: "Impresora Bluetooth vinculada. Se conecta al imprimir.",
        transportId: transport.id,
      });
    } else if (transport.id === "native-ble-s1" && deps.nativeBleIsPaired()) {
      setSnapshot({
        phase: "paired",
        connected: false,
        message: "Impresora Bluetooth vinculada. Se conecta al imprimir.",
        transportId: transport.id,
      });
    } else if (transport.id === "native") {
      setSnapshot({
        phase: "none",
        connected: false,
        message: "Enchufá la ticketera USB o vinculá la S1 Bluetooth.",
        transportId: transport.id,
      });
    } else {
      setSnapshot({
        phase: "none",
        connected: false,
        message: NOT_PAIRED_MESSAGE,
        transportId: transport.id,
      });
    }
  }

  async function pair(): Promise<void> {
    if (typeof window === "undefined") throw new Error(NO_SUPPORT_MESSAGE);
    const transport = deps.selectTransport();

    // En APK sin USB: vincular S1 nativa.
    if (transport?.id === "native-ble-s1") {
      await nativeBleS1Transport.pair();
    } else if (transport?.id === "native") {
      await transport.pair();
    } else if (deps.bleTransport.isAvailable() && deps.getStoredBleDeviceId() === null) {
      // Flujo comandera Chrome: Vincular apunta a la S1.
      await deps.bleTransport.pair();
    } else if (transport) {
      await transport.pair();
    } else if (deps.hasNativeBle()) {
      await nativeBleS1Transport.pair();
    } else {
      throw new Error(NO_SUPPORT_MESSAGE);
    }
    await refresh();
  }

  /**
   * Reconecta a la impresora ya vinculada. La Bluetooth se apaga sola por
   * ahorro de energía, así que hace falta poder despertarla a mano antes de
   * empezar a vender, sin pasar otra vez por el selector del navegador.
   */
  async function connect(): Promise<void> {
    if (typeof window === "undefined") throw new Error(NO_SUPPORT_MESSAGE);
    const transport = deps.selectTransport();
    if (!transport) throw new Error(NO_SUPPORT_MESSAGE);
    if (!transport.connect) {
      await refresh();
      return;
    }
    setSnapshot({ ...snapshot, message: "Conectando con la impresora…" });
    try {
      await transport.connect();
    } finally {
      await refresh();
    }
  }

  function print(payload: TransportPrintPayload, meta?: PrintMeta): Promise<void> {
    const transport = deps.selectTransport();
    if (!transport) {
      return Promise.reject(new Error(NO_SUPPORT_MESSAGE));
    }
    // ensureConnected de la BLE corre DENTRO del job: nunca dos connect a la vez.
    return queue.enqueue({
      label: meta?.label ?? "ticket",
      orderId: meta?.orderId,
      run: () => transport.print(payload),
    });
  }

  queue.subscribe((status) => {
    if (status.state === "printing") {
      setSnapshot({ ...snapshot, phase: "printing", message: status.message });
    } else if (status.state === "error") {
      setSnapshot({ ...snapshot, phase: "error", connected: false, message: status.message });
    } else {
      void refresh();
    }
  });

  deps.setBleDisconnectListener(() => {
    void refresh();
  });

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    refresh,
    pair,
    connect,
    print,
  };
}

export const printerManager: PrinterManager = createPrinterManager();
