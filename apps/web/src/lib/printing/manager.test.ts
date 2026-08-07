import { describe, expect, it, vi } from "vitest";

import type { TicketContent } from "@cocktrail/shared";

import { createPrinterManager, NO_SUPPORT_MESSAGE } from "./manager";
import type { PrinterTransport, TransportPrintPayload } from "./types";

const payload: TransportPrintPayload = {
  escposBase64: "AA==",
  ticketContent: { brand: "BOSKO", dateText: "hoy", items: [] } as TicketContent,
};

function fakeTransport(overrides: Partial<PrinterTransport> = {}): PrinterTransport {
  return {
    id: "webusb",
    isAvailable: () => true,
    isConnected: async () => true,
    pair: vi.fn(async () => {}),
    print: vi.fn(async () => {}),
    ...overrides,
  };
}

const unavailableBle = fakeTransport({ id: "ble-s1", isAvailable: () => false });

function makeManager(opts: {
  transport?: PrinterTransport | null;
  ble?: PrinterTransport;
  storedBleId?: string | null;
}) {
  return createPrinterManager({
    selectTransport: () => opts.transport ?? null,
    bleTransport: opts.ble ?? unavailableBle,
    getStoredBleDeviceId: () => opts.storedBleId ?? null,
    setBleDisconnectListener: () => {},
  });
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("printerManager.getSnapshot", () => {
  it("arranca en none y devuelve siempre la misma referencia si nada cambió", () => {
    const manager = makeManager({ transport: null });
    const first = manager.getSnapshot();
    expect(first).toMatchObject({ phase: "none", connected: false });
    expect(manager.getSnapshot()).toBe(first);
  });
});

describe("printerManager.refresh", () => {
  it("sin transporte ni BLE posible: unsupported con el mensaje de ayuda", async () => {
    const manager = makeManager({ transport: null });
    await manager.refresh();
    expect(manager.getSnapshot()).toEqual({
      phase: "unsupported",
      connected: false,
      message: NO_SUPPORT_MESSAGE,
    });
  });

  it("sin transporte pero con BLE disponible: none invitando a vincular", async () => {
    const manager = makeManager({
      transport: null,
      ble: fakeTransport({ id: "ble-s1" }),
    });
    await manager.refresh();
    expect(manager.getSnapshot().phase).toBe("none");
    expect(manager.getSnapshot().message).toMatch(/Vincular impresora/);
  });

  it("transporte conectado: connected con su transportId", async () => {
    const manager = makeManager({ transport: fakeTransport() });
    await manager.refresh();
    expect(manager.getSnapshot()).toMatchObject({
      phase: "connected",
      connected: true,
      transportId: "webusb",
    });
  });

  it("BLE vinculada sin GATT verificado: paired, NO connected", async () => {
    const ble = fakeTransport({ id: "ble-s1", isConnected: async () => false });
    const manager = makeManager({ transport: ble, ble, storedBleId: "dev-1" });
    await manager.refresh();
    expect(manager.getSnapshot()).toMatchObject({
      phase: "paired",
      connected: false,
      transportId: "ble-s1",
    });
  });

  it("dos refresh sin cambios mantienen la misma referencia de snapshot", async () => {
    const manager = makeManager({ transport: fakeTransport() });
    await manager.refresh();
    const first = manager.getSnapshot();
    await manager.refresh();
    expect(manager.getSnapshot()).toBe(first);
  });
});

describe("printerManager.pair", () => {
  it("sin ningún soporte rechaza con el mensaje de ayuda", async () => {
    const manager = makeManager({ transport: null });
    await expect(manager.pair()).rejects.toThrow(NO_SUPPORT_MESSAGE);
  });

  it("con BLE disponible y sin vincular, el pair va a la BLE aunque haya WebUSB", async () => {
    const ble = fakeTransport({ id: "ble-s1", isConnected: async () => false });
    const usb = fakeTransport();
    const manager = makeManager({ transport: usb, ble, storedBleId: null });

    await manager.pair();

    expect(ble.pair).toHaveBeenCalledTimes(1);
    expect(usb.pair).not.toHaveBeenCalled();
  });

  it("con BLE ya vinculada usa el transporte elegido", async () => {
    const ble = fakeTransport({ id: "ble-s1", isConnected: async () => false });
    const manager = makeManager({ transport: ble, ble, storedBleId: "dev-1" });

    await manager.pair();

    expect(ble.pair).toHaveBeenCalledTimes(1);
  });

  it("el puente nativo siempre parea nativo", async () => {
    const native = fakeTransport({ id: "native" });
    const ble = fakeTransport({ id: "ble-s1" });
    const manager = makeManager({ transport: native, ble, storedBleId: null });

    await manager.pair();

    expect(native.pair).toHaveBeenCalledTimes(1);
    expect(ble.pair).not.toHaveBeenCalled();
  });
});

describe("printerManager.print", () => {
  it("sin transporte rechaza con el mensaje de ayuda", async () => {
    const manager = makeManager({ transport: null });
    await expect(manager.print(payload)).rejects.toThrow(NO_SUPPORT_MESSAGE);
  });

  it("imprime por la cola: printing durante el job y de vuelta a connected al final", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const transport = fakeTransport({ print: vi.fn(() => gate) });
    const manager = makeManager({ transport });
    await manager.refresh();

    const phases: string[] = [];
    manager.subscribe(() => phases.push(manager.getSnapshot().phase));

    const printing = manager.print(payload, { label: "ticket #1", orderId: "o-1" });
    await tick();
    expect(manager.getSnapshot().phase).toBe("printing");
    expect(manager.getSnapshot().message).toBe("Imprimiendo ticket #1…");

    release();
    await printing;
    await tick();
    expect(manager.getSnapshot().phase).toBe("connected");
    expect(transport.print).toHaveBeenCalledWith(payload);
    expect(phases).toContain("printing");
  });

  it("si el job falla, el snapshot pasa a error con el mensaje del fallo", async () => {
    const transport = fakeTransport({
      print: vi.fn(async () => {
        throw new Error("Se apagó la impresora");
      }),
    });
    const manager = makeManager({ transport });

    await expect(manager.print(payload)).rejects.toThrow("Se apagó la impresora");
    expect(manager.getSnapshot()).toMatchObject({
      phase: "error",
      connected: false,
      message: "Se apagó la impresora",
    });
  });
});
