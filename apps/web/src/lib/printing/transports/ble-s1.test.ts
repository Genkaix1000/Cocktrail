import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TicketContent } from "@cocktrail/shared";

import {
  __resetBleTransportForTests,
  BLE_CHUNK_KEY,
  BLE_PRINTER_ID_KEY,
  bleS1Transport,
  getBleChunkSizeOverride,
  getStoredBleDeviceId,
  setBleDisconnectListener,
} from "./ble-s1";

type FakeDevice = {
  id: string;
  name?: string;
  gatt?: unknown;
  addEventListener: ReturnType<typeof vi.fn>;
};

function makeDevice(id: string): FakeDevice {
  return { id, name: `PPS1-${id}`, gatt: undefined, addEventListener: vi.fn() };
}

function stubBluetooth(api: Record<string, unknown>) {
  Object.defineProperty(navigator, "bluetooth", { value: api, configurable: true });
}

const payload = {
  escposBase64: "AA==",
  ticketContent: { brand: "BOSKO", dateText: "hoy", items: [] } as TicketContent,
};

beforeEach(() => {
  __resetBleTransportForTests();
  localStorage.clear();
});

afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).bluetooth;
});

describe("bleS1Transport.isAvailable", () => {
  it("false sin navigator.bluetooth", () => {
    expect(bleS1Transport.isAvailable()).toBe(false);
  });

  it("true con navigator.bluetooth presente", () => {
    stubBluetooth({});
    expect(bleS1Transport.isAvailable()).toBe(true);
  });
});

describe("getStoredBleDeviceId", () => {
  it("null si nunca se vinculó", () => {
    expect(getStoredBleDeviceId()).toBeNull();
  });

  it("devuelve el id guardado", () => {
    localStorage.setItem(BLE_PRINTER_ID_KEY, "dev-42");
    expect(getStoredBleDeviceId()).toBe("dev-42");
  });
});

describe("bleS1Transport.pair", () => {
  it("sin Web Bluetooth rechaza con mensaje claro", async () => {
    await expect(bleS1Transport.pair()).rejects.toThrow(/Web Bluetooth/);
  });

  it("pide device por prefijo PPS1 + servicio 0xff00 y guarda el id", async () => {
    const device = makeDevice("dev-1");
    const requestDevice = vi.fn(async () => device);
    stubBluetooth({ requestDevice });

    await bleS1Transport.pair();

    expect(requestDevice).toHaveBeenCalledWith({
      filters: [{ namePrefix: "PPS1" }],
      optionalServices: [0xff00],
    });
    expect(localStorage.getItem(BLE_PRINTER_ID_KEY)).toBe("dev-1");
    // se registra el listener de desconexión sobre el device cacheado
    expect(device.addEventListener).toHaveBeenCalledWith(
      "gattserverdisconnected",
      expect.any(Function),
    );
  });

  it("vinculada NO implica conectada (honestidad de estado)", async () => {
    const device = makeDevice("dev-1");
    stubBluetooth({ requestDevice: vi.fn(async () => device) });

    await bleS1Transport.pair();

    await expect(bleS1Transport.isConnected()).resolves.toBe(false);
  });
});

describe("bleS1Transport.isConnected", () => {
  it("false sin GATT cacheado y NO dispara ninguna conexión", async () => {
    const getDevices = vi.fn(async () => []);
    stubBluetooth({ getDevices });
    localStorage.setItem(BLE_PRINTER_ID_KEY, "dev-1");

    await expect(bleS1Transport.isConnected()).resolves.toBe(false);
    expect(getDevices).not.toHaveBeenCalled();
  });
});

describe("bleS1Transport.print", () => {
  it("sin impresora vinculada rechaza pidiendo vincular", async () => {
    stubBluetooth({ getDevices: vi.fn(async () => []) });
    await expect(bleS1Transport.print(payload)).rejects.toThrow(
      /No hay impresora Bluetooth vinculada/,
    );
  });

  it("con id guardado pero sin getDevices (API ausente) rechaza sin romper", async () => {
    stubBluetooth({});
    localStorage.setItem(BLE_PRINTER_ID_KEY, "dev-1");
    await expect(bleS1Transport.print(payload)).rejects.toThrow(
      /No hay impresora Bluetooth vinculada/,
    );
  });
});

describe("getBleChunkSizeOverride", () => {
  it("sin nada guardado devuelve undefined (se usa el default 20)", () => {
    expect(getBleChunkSizeOverride()).toBeUndefined();
  });

  it("acepta un entero válido dentro de [20, 512]", () => {
    localStorage.setItem(BLE_CHUNK_KEY, "180");
    expect(getBleChunkSizeOverride()).toBe(180);
    localStorage.setItem(BLE_CHUNK_KEY, "20");
    expect(getBleChunkSizeOverride()).toBe(20);
    localStorage.setItem(BLE_CHUNK_KEY, "512");
    expect(getBleChunkSizeOverride()).toBe(512);
  });

  it("ignora valores inválidos: fuera de rango, no enteros o basura", () => {
    for (const raw of ["19", "513", "180.5", "-1", "banana", ""]) {
      localStorage.setItem(BLE_CHUNK_KEY, raw);
      expect(getBleChunkSizeOverride()).toBeUndefined();
    }
  });
});

describe("desconexión GATT", () => {
  it("el evento gattserverdisconnected notifica al listener registrado", async () => {
    const device = makeDevice("dev-1");
    stubBluetooth({ requestDevice: vi.fn(async () => device) });
    const onDisconnect = vi.fn();
    setBleDisconnectListener(onDisconnect);

    await bleS1Transport.pair();
    const handler = device.addEventListener.mock.calls[0][1] as () => void;
    handler();

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });
});
