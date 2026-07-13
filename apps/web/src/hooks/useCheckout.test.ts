import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useCheckout } from "./useCheckout";
import { mercadopagoService } from "@/services/mercadopago.service";
import { ordersService } from "@/services/orders.service";
import type { Drink, Order } from "@cocktrail/shared";

vi.mock("@/services/mercadopago.service", () => ({
  mercadopagoService: {
    createPosIntent: vi.fn(),
    getPosIntentStatus: vi.fn(),
    cancelPosIntent: vi.fn(),
  },
}));

vi.mock("@/services/orders.service", () => ({
  ordersService: {
    create: vi.fn(),
  },
}));

const mockedMercadopagoService = vi.mocked(mercadopagoService);
const mockedOrdersService = vi.mocked(ordersService);

function makeDrink(overrides: Partial<Drink> = {}): Drink {
  return {
    id: 1,
    name: "Fernet con Coca",
    price: 2500,
    description: "Clásico",
    vibe: "party",
    flavors: [],
    iconName: "glass-water",
    trending: false,
    promo: false,
    available: true,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order & { printed: boolean } {
  return {
    id: "order-1",
    token: "TKN-1",
    displayNumber: 1,
    items: [{ drinkId: 1, name: "Fernet con Coca", qty: 1, unitPrice: 2500, subtotal: 2500 }],
    total: 2500,
    paymentMethod: "debito",
    status: "pendiente",
    createdAt: Date.now(),
    createdBy: "cajera1",
    printed: true,
    ...overrides,
  };
}

function setupHook() {
  const drink = makeDrink();
  return renderHook(() =>
    useCheckout({
      cart: { 1: 1 },
      cartEntries: [{ drink, qty: 1 }],
      totalPrice: 2500,
      totalItems: 1,
      clearCart: vi.fn(),
    }),
  );
}

describe("useCheckout — cobro Posnet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedMercadopagoService.cancelPosIntent.mockResolvedValue({ status: "CANCELED" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("FINISHED crea el pedido y vuelve a idle", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue({ id: "intent-1" });
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({ status: "FINISHED" });
    mockedOrdersService.create.mockResolvedValue(makeOrder());

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mockedOrdersService.create).toHaveBeenCalledWith({
      items: [{ drinkId: 1, qty: 1 }],
      paymentMethod: "debito",
    });
    expect(result.current.posnetStatus).toBe("idle");
    expect(result.current.latestOrder).not.toBeNull();
  });

  it("CANCELED marca error y no crea el pedido", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue({ id: "intent-1" });
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({ status: "CANCELED" });

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toBe("cancelled_by_device");
    expect(mockedOrdersService.create).not.toHaveBeenCalled();
  });

  it.each(["OPEN", "ON_TERMINAL", "PENDING"] as const)(
    "status %s sigue esperando, sin crear el pedido ni marcar error",
    async (status) => {
      mockedMercadopagoService.createPosIntent.mockResolvedValue({ id: "intent-1" });
      mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({ status });

      const { result } = setupHook();

      await act(async () => {
        await result.current.startPosnetPayment("debito");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(mockedOrdersService.create).not.toHaveBeenCalled();
      expect(result.current.posnetStatus).not.toBe("error");
    },
  );

  it("un error de red al consultar el estado marca posnetStatus en error", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue({ id: "intent-1" });
    mockedMercadopagoService.getPosIntentStatus.mockRejectedValue(new Error("network down"));

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toContain("Error al consultar el estado del cobro");
  });

  it("desmontar el componente con un intent activo lo cancela en el device", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue({ id: "intent-1" });
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({ status: "OPEN" });
    mockedMercadopagoService.cancelPosIntent.mockResolvedValue({ status: "CANCELED" });

    const { result, unmount } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });

    expect(result.current.currentIntentId).toBe("intent-1");

    unmount();

    expect(mockedMercadopagoService.cancelPosIntent).toHaveBeenCalledWith("intent-1");
  });

  it("desmontar sin ningún intent activo no llama a cancelPosIntent", async () => {
    const { unmount } = setupHook();

    unmount();

    expect(mockedMercadopagoService.cancelPosIntent).not.toHaveBeenCalled();
  });

  it("desmontar después de un cobro FINISHED no cancela (el intent ya está cerrado)", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue({ id: "intent-1" });
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({ status: "FINISHED" });
    mockedOrdersService.create.mockResolvedValue(makeOrder());

    const { result, unmount } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.currentIntentId).toBeNull();

    unmount();

    expect(mockedMercadopagoService.cancelPosIntent).not.toHaveBeenCalled();
  });

  it("handleOpenCheckout cancela un intent activo abandonado antes de resetear el estado", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue({ id: "intent-1" });
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({ status: "OPEN" });
    mockedMercadopagoService.cancelPosIntent.mockResolvedValue({ status: "CANCELED" });

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });
    expect(result.current.currentIntentId).toBe("intent-1");

    act(() => {
      result.current.handleOpenCheckout();
    });

    expect(mockedMercadopagoService.cancelPosIntent).toHaveBeenCalledWith("intent-1");
    expect(result.current.currentIntentId).toBeNull();
  });
});
