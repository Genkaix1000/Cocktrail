import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useOfflineScanQueue } from "./useOfflineScanQueue";
import { ticketsService } from "@/services/tickets.service";
import type { Order } from "@cocktrail/shared";

// El hook llama a ticketsService.redeem — se mockea para no pegarle a la API real.
vi.mock("@/services/tickets.service", () => ({
  ticketsService: {
    redeem: vi.fn(),
  },
}));

const mockedTicketsService = vi.mocked(ticketsService);

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    token: "TKN-1",
    displayNumber: 7,
    items: [{ drinkId: 1, name: "Fernet con Coca", qty: 1, unitPrice: 2500, subtotal: 2500 }],
    total: 2500,
    paymentMethod: "efectivo",
    status: "entregado",
    createdAt: Date.now(),
    createdBy: "barra1",
    ...overrides,
  };
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

describe("useOfflineScanQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setOnline(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const triggerFlash = vi.fn();
    const fetchPendingOrders = vi.fn();
    const onRedeemed = vi.fn();

    const view = renderHook(() =>
      useOfflineScanQueue({
        barCode: "BARRA-01",
        triggerFlash,
        fetchPendingOrders,
        onRedeemed,
      }),
    );

    return { ...view, triggerFlash, fetchPendingOrders, onRedeemed };
  }

  it("carga la cola offline persistida en localStorage al montar", async () => {
    localStorage.setItem("cocktrail_offline_scans", JSON.stringify(["CODE-A", "CODE-B"]));

    const { result } = setup();

    await waitFor(() => {
      expect(result.current.offlineQueue).toEqual(["CODE-A", "CODE-B"]);
    });
  });

  it("encola el escaneo cuando el navegador está offline", async () => {
    setOnline(false);
    const { result, triggerFlash } = setup();

    let ok: boolean = true;
    await act(async () => {
      ok = await result.current.handleScan("CODE-OFFLINE");
    });

    expect(ok).toBe(false);
    expect(mockedTicketsService.redeem).not.toHaveBeenCalled();
    expect(result.current.offlineQueue).toContain("CODE-OFFLINE");
    expect(JSON.parse(localStorage.getItem("cocktrail_offline_scans") || "[]")).toContain("CODE-OFFLINE");
    expect(triggerFlash).toHaveBeenCalledWith(
      expect.objectContaining({ type: "duplicate", message: expect.stringContaining("Offline") }),
    );
  });

  it("encola el escaneo cuando el canje falla por un error de red", async () => {
    mockedTicketsService.redeem.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result, triggerFlash } = setup();

    let ok: boolean = true;
    await act(async () => {
      ok = await result.current.handleScan("CODE-NET-ERR");
    });

    expect(ok).toBe(false);
    expect(result.current.offlineQueue).toContain("CODE-NET-ERR");
    expect(triggerFlash).toHaveBeenCalledWith(
      expect.objectContaining({ type: "duplicate", message: expect.stringContaining("Red inestable") }),
    );
  });

  it("en un canje exitoso llama a redeem, reporta onRedeemed y no encola nada", async () => {
    const order = makeOrder();
    mockedTicketsService.redeem.mockResolvedValueOnce({ success: true, order, status: "success" });
    const { result, triggerFlash, fetchPendingOrders, onRedeemed } = setup();

    let ok: boolean = false;
    await act(async () => {
      ok = await result.current.handleScan("CODE-OK");
    });

    expect(ok).toBe(true);
    expect(mockedTicketsService.redeem).toHaveBeenCalledWith("CODE-OK", { barCode: "BARRA-01", method: "scan" });
    expect(onRedeemed).toHaveBeenCalledWith(order);
    expect(fetchPendingOrders).toHaveBeenCalled();
    expect(result.current.offlineQueue).toEqual([]);
    expect(triggerFlash).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });

  it("sincroniza la cola offline al recuperar la conexión", async () => {
    // No se siembra localStorage antes del montaje: eso pisaría en una carrera
    // real (mismo comportamiento que el código original) contra la sync que
    // dispara este mismo mount. Acá se reproduce el flujo real: arranca
    // online y sin cola, se pierde la conexión, se escanea (encola), y al
    // volver la conexión se dispara la sincronización.
    setOnline(false);
    const { result, triggerFlash, fetchPendingOrders } = setup();

    await act(async () => {
      await result.current.handleScan("CODE-PENDING");
    });
    expect(result.current.offlineQueue).toEqual(["CODE-PENDING"]);

    mockedTicketsService.redeem.mockResolvedValueOnce({ success: true, order: makeOrder(), status: "success" });
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(mockedTicketsService.redeem).toHaveBeenCalledWith("CODE-PENDING");
    });

    await waitFor(() => {
      expect(result.current.offlineQueue).toEqual([]);
    });

    expect(JSON.parse(localStorage.getItem("cocktrail_offline_scans") || "[]")).toEqual([]);
    expect(fetchPendingOrders).toHaveBeenCalled();
    expect(triggerFlash).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", message: expect.stringContaining("Sincronizados") }),
    );
  });
});
