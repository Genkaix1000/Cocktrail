import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { usePrinterStatus } from "./usePrinterStatus";
import { printerManager } from "@/lib/printing/manager";
import { printerService } from "@/services/printer.service";
import type { PrinterSnapshot } from "@/lib/printing/types";
import type { PrintPayload, TicketContent } from "@cocktrail/shared";

vi.mock("@/lib/printing/manager", () => ({
  printerManager: {
    subscribe: vi.fn(),
    getSnapshot: vi.fn(),
    refresh: vi.fn(),
    pair: vi.fn(),
    print: vi.fn(),
  },
}));

vi.mock("@/services/printer.service", () => ({
  printerService: {
    test: vi.fn(),
    reprint: vi.fn(),
  },
}));

const mockedManager = vi.mocked(printerManager);
const mockedPrinterService = vi.mocked(printerService);

// Estado del manager falso: snapshot mutable + listeners reales, para poder
// disparar re-renders como lo haría el manager de verdad.
let snapshot: PrinterSnapshot;
let listeners: Set<() => void>;

function setSnapshot(next: PrinterSnapshot) {
  snapshot = next;
  for (const l of listeners) l();
}

function makeTicketContent(overrides: Partial<TicketContent> = {}): TicketContent {
  return {
    brand: "BOSKO",
    dateText: "07/08/2026 23:15",
    items: [{ qty: 1, name: "Fernet con Coca" }],
    ...overrides,
  };
}

function makePrintPayload(overrides: Partial<PrintPayload> = {}): PrintPayload {
  return {
    success: true,
    message: "Ticket de prueba enviado.",
    data: "YQ==",
    ticketContent: makeTicketContent(),
    ...overrides,
  };
}

beforeEach(() => {
  snapshot = { phase: "none", connected: false, message: "" };
  listeners = new Set();
  mockedManager.subscribe.mockImplementation((listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  });
  mockedManager.getSnapshot.mockImplementation(() => snapshot);
  mockedManager.refresh.mockResolvedValue(undefined);
  mockedManager.pair.mockResolvedValue(undefined);
  mockedManager.print.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePrinterStatus — snapshot del manager", () => {
  it("con el snapshot inicial (sin mensaje) printerStatus es null y refresca al montar", () => {
    const { result } = renderHook(() => usePrinterStatus());

    expect(result.current.printerStatus).toBeNull();
    expect(mockedManager.refresh).toHaveBeenCalled();
  });

  it("mapea el snapshot a { connected, message } y re-renderiza al notificar", () => {
    const { result } = renderHook(() => usePrinterStatus());

    act(() => {
      setSnapshot({
        phase: "connected",
        connected: true,
        message: "Impresora conectada.",
        transportId: "ble-s1",
      });
    });

    expect(result.current.printerStatus).toEqual({
      connected: true,
      message: "Impresora conectada.",
    });

    act(() => {
      setSnapshot({
        phase: "paired",
        connected: false,
        message: "Impresora Bluetooth vinculada. Se conecta al imprimir.",
        transportId: "ble-s1",
      });
    });

    expect(result.current.printerStatus).toEqual({
      connected: false,
      message: "Impresora Bluetooth vinculada. Se conecta al imprimir.",
    });
  });
});

describe("usePrinterStatus — printTicket", () => {
  it("con ticketData + ticketContent encola en el manager con el orderId", async () => {
    const content = makeTicketContent();
    const { result } = renderHook(() => usePrinterStatus());

    await act(async () => {
      await result.current.printTicket({ id: "order-1", ticketData: "YQ==", ticketContent: content });
    });

    expect(mockedManager.print).toHaveBeenCalledWith(
      { escposBase64: "YQ==", ticketContent: content },
      { orderId: "order-1" },
    );
    expect(result.current.printError).toBeNull();
  });

  it.each([
    ["sin ticketData", { ticketContent: makeTicketContent() }],
    ["sin ticketContent", { ticketData: "YQ==" }],
  ])("payload incompleto (%s) setea printError y lanza sin tocar el manager", async (_label, order) => {
    const { result } = renderHook(() => usePrinterStatus());

    // Capturar el error DENTRO de act para que los setState se flusheen.
    let thrown: unknown;
    await act(async () => {
      thrown = await result.current.printTicket(order).catch((e: unknown) => e);
    });

    expect(thrown).toBeInstanceOf(Error);
    expect(mockedManager.print).not.toHaveBeenCalled();
    expect(result.current.printError).toContain("reimprimí desde el historial");
  });

  it("si el manager falla, setea printError y RE-LANZA (la venta decide qué hacer)", async () => {
    mockedManager.print.mockRejectedValue(new Error("Bluetooth desconectado"));
    const { result } = renderHook(() => usePrinterStatus());

    let thrown: unknown;
    await act(async () => {
      thrown = await result.current
        .printTicket({ ticketData: "YQ==", ticketContent: makeTicketContent() })
        .catch((e: unknown) => e);
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Bluetooth desconectado");
    expect(result.current.printError).toBe("Bluetooth desconectado");
  });
});

describe("usePrinterStatus — reprintTicket", () => {
  it("pide el payload al server y encola el par en el manager", async () => {
    const payload = makePrintPayload();
    mockedPrinterService.reprint.mockResolvedValue(payload);
    const { result } = renderHook(() => usePrinterStatus());

    await act(async () => {
      await result.current.reprintTicket("order-9");
    });

    expect(mockedPrinterService.reprint).toHaveBeenCalledWith("order-9");
    expect(mockedManager.print).toHaveBeenCalledWith(
      { escposBase64: payload.data, ticketContent: payload.ticketContent },
      { orderId: "order-9" },
    );
    expect(result.current.reprinting).toBe(false);
  });

  it("TRAGA el error (solo printError, no lanza) y apaga reprinting", async () => {
    mockedPrinterService.reprint.mockResolvedValue(makePrintPayload());
    mockedManager.print.mockRejectedValue(new Error("Sin impresora vinculada."));
    const { result } = renderHook(() => usePrinterStatus());

    await act(async () => {
      await result.current.reprintTicket("order-9");
    });

    expect(result.current.printError).toBe("Sin impresora vinculada.");
    expect(result.current.reprinting).toBe(false);
  });
});

describe("usePrinterStatus — testPrint y pair", () => {
  it("testPrint imprime el payload del server y muestra su mensaje", async () => {
    const payload = makePrintPayload();
    mockedPrinterService.test.mockResolvedValue(payload);
    const { result } = renderHook(() => usePrinterStatus());

    await act(async () => {
      await result.current.testPrint();
    });

    expect(mockedManager.print).toHaveBeenCalledWith(
      { escposBase64: payload.data, ticketContent: payload.ticketContent },
      { label: "ticket de prueba" },
    );
    expect(result.current.printerTestMessage).toBe("Ticket de prueba enviado.");
  });

  it("testPrint con fallo de impresión muestra el error como mensaje (no explota)", async () => {
    mockedPrinterService.test.mockResolvedValue(makePrintPayload());
    mockedManager.print.mockRejectedValue(new Error("Sin impresora vinculada."));
    const { result } = renderHook(() => usePrinterStatus());

    await act(async () => {
      await result.current.testPrint();
    });

    expect(result.current.printerTestMessage).toBe("Sin impresora vinculada.");
  });

  it("criterio de aceptación 2: en entorno sin soporte, Vincular muestra el mensaje del manager", async () => {
    // El manager rechaza pair() con el mensaje de entorno sin soporte.
    mockedManager.pair.mockRejectedValue(
      new Error(
        "Sin Web Bluetooth. En Chrome → chrome://flags activá “Experimental Web Platform features”.",
      ),
    );
    const { result } = renderHook(() => usePrinterStatus());

    await act(async () => {
      await result.current.pairPrinterDevice();
    });

    await waitFor(() => {
      expect(result.current.printerTestMessage).toMatch(/chrome:\/\/flags/);
    });
  });

  it("pair OK no deja mensaje de error (el estado lo cuenta el snapshot)", async () => {
    const { result } = renderHook(() => usePrinterStatus());

    await act(async () => {
      await result.current.pairPrinterDevice();
    });

    expect(mockedManager.pair).toHaveBeenCalled();
    expect(result.current.printerTestMessage).toBeNull();
  });
});
