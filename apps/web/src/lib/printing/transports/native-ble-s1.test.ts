import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../raster", () => ({
  renderTicketBitmap: () => ({
    widthPx: 384,
    heightPx: 8,
    widthBytes: 48,
    rows: [new Uint8Array(48)],
  }),
}));

const { buildS1Sequence } = vi.hoisted(() => ({
  buildS1Sequence: vi.fn(() => [
    { bytes: new Uint8Array([1, 2, 3]), delayAfterMs: 10 },
    { bytes: new Uint8Array([4]), delayAfterMs: 0 },
  ]),
}));

vi.mock("../s1-protocol", () => ({
  buildS1Sequence,
}));

import { NATIVE_BLE_CHUNK_BYTES, nativeBleS1Transport } from "./native-ble-s1";
import type { TicketContent } from "@cocktrail/shared";

const ticket: TicketContent = {
  brand: "BOSKO",
  dateText: "hoy",
  items: [],
};

function stubBridge(overrides: Record<string, unknown> = {}) {
  const bridge = {
    blePair: vi.fn(() => "ok"),
    bleIsPaired: vi.fn(() => true),
    bleIsConnected: vi.fn(() => false),
    bleConnect: vi.fn(() => "ok"),
    blePrintSteps: vi.fn((_json: string) => "ok"),
    ...overrides,
  };
  (window as unknown as Record<string, unknown>).MiBolichePrinter = bridge;
  return bridge;
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).MiBolichePrinter;
});

describe("nativeBleS1Transport", () => {
  it("isAvailable solo si el bridge expone blePair", () => {
    expect(nativeBleS1Transport.isAvailable()).toBe(false);
    stubBridge();
    expect(nativeBleS1Transport.isAvailable()).toBe(true);
  });

  it("pair propaga el error del bridge", async () => {
    stubBridge({ blePair: () => "No encontramos una impresora PPS1." });
    await expect(nativeBleS1Transport.pair()).rejects.toThrow(/PPS1/);
  });

  it("print manda steps JSON al bridge", async () => {
    const bridge = stubBridge({ bleIsConnected: () => true });
    await nativeBleS1Transport.print({
      escposBase64: "AA==",
      ticketContent: ticket,
    });
    expect(bridge.blePrintSteps).toHaveBeenCalled();
    const arg = bridge.blePrintSteps.mock.calls[0]![0] as string;
    const steps = JSON.parse(arg) as { b: string; d: number }[];
    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual({ b: btoa("\x01\x02\x03"), d: 10 });
    expect(steps[1]).toEqual({ b: btoa("\x04"), d: 0 });
    expect(buildS1Sequence).toHaveBeenCalledWith(
      expect.anything(),
      { chunkSize: NATIVE_BLE_CHUNK_BYTES },
    );
  });
});
