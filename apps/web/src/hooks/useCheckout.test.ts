import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useCheckout } from "./useCheckout";
import { listPendingSales } from "@/lib/pendingSales";
import { mercadopagoService, type MpQrOrderStatus } from "@/services/mercadopago.service";
import { ordersService } from "@/services/orders.service";
import type { Drink, Order } from "@cocktrail/shared";

vi.mock("@/services/mercadopago.service", () => ({
  mercadopagoService: {
    createPosIntent: vi.fn(),
    getPosIntentStatus: vi.fn(),
    cancelPosIntent: vi.fn(),
    createQrOrder: vi.fn(),
    getQrOrderStatus: vi.fn(),
    cancelQrOrder: vi.fn(),
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

/** Response del create QR con expiración a futuro (15 min, como el backend). */
function makeQrCreated(overrides: Partial<{ orderId: string; qrImage: string | null; expiresAt: string }> = {}) {
  return {
    orderId: "ORD01QR",
    qrImage: "data:image/png;base64,qr",
    status: "created" as const,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    ...overrides,
  };
}

function makeQrStatus(status: MpQrOrderStatus) {
  return { orderIdMp: "ORD01QR", status, paymentId: null, amount: 2500, expiresAt: null };
}

describe("useCheckout — cobro Posnet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
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

  it("A11: si el registro falla tras FINISHED, la constancia queda y el mensaje es el específico", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue({ id: "intent-1" });
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({ status: "FINISHED" });
    mockedOrdersService.create.mockRejectedValue(new Error("ECONNREFUSED"));

    const { result, unmount } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toBe(
      "El cobro se realizó correctamente pero no se pudo registrar la venta. Quedó guardada para reintentar — no volvés a cobrar.",
    );
    expect(result.current.pendingSales).toHaveLength(1);
    expect(result.current.pendingSales[0]).toMatchObject({
      paymentMethod: "debito",
      mpRef: "intent-1",
      amount: 2500,
      attempts: 1,
      lastError: "ECONNREFUSED",
    });
    expect(listPendingSales()).toHaveLength(1);

    // El cobro ya está hecho: desmontar no debe cancelarlo en el device.
    unmount();
    expect(mockedMercadopagoService.cancelPosIntent).not.toHaveBeenCalled();
  });
});

describe("useCheckout — cobro QR (integridad)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    mockedMercadopagoService.cancelQrOrder.mockResolvedValue({ status: "canceled" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("processed crea el pedido, limpia la constancia y vuelve a idle", async () => {
    mockedMercadopagoService.createQrOrder.mockResolvedValue(makeQrCreated());
    mockedMercadopagoService.getQrOrderStatus.mockResolvedValue(makeQrStatus("processed"));
    mockedOrdersService.create.mockResolvedValue(makeOrder({ paymentMethod: "qr" }));

    const { result } = setupHook();

    await act(async () => {
      await result.current.startQrPayment();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mockedOrdersService.create).toHaveBeenCalledWith({
      items: [{ drinkId: 1, qty: 1 }],
      paymentMethod: "qr",
    });
    expect(result.current.posnetStatus).toBe("idle");
    expect(result.current.latestOrder).not.toBeNull();
    // La constancia write-ahead se escribió y se removió al registrar OK.
    expect(result.current.pendingSales).toEqual([]);
    expect(listPendingSales()).toEqual([]);
  });

  it("si el registro falla tras processed, la constancia queda y el mensaje es el específico (nunca el genérico)", async () => {
    mockedMercadopagoService.createQrOrder.mockResolvedValue(makeQrCreated());
    mockedMercadopagoService.getQrOrderStatus.mockResolvedValue(makeQrStatus("processed"));
    mockedOrdersService.create.mockRejectedValue(new Error("network down"));

    const { result, unmount } = setupHook();

    await act(async () => {
      await result.current.startQrPayment();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toBe(
      "El cobro se realizó correctamente pero no se pudo registrar la venta. Quedó guardada para reintentar — no volvés a cobrar.",
    );
    expect(result.current.pendingSales).toHaveLength(1);
    expect(result.current.pendingSales[0]).toMatchObject({
      paymentMethod: "qr",
      mpRef: "ORD01QR",
      amount: 2500,
      attempts: 1,
      lastError: "network down",
    });
    expect(listPendingSales()).toHaveLength(1);

    // El cobro ya está hecho: desmontar no debe cancelar la order paga en MP.
    unmount();
    expect(mockedMercadopagoService.cancelQrOrder).not.toHaveBeenCalled();
  });

  it("A10: pasado el expiresAt corta el polling, cancela best-effort y muestra el mensaje de expiración", async () => {
    mockedMercadopagoService.createQrOrder.mockResolvedValue(
      makeQrCreated({ expiresAt: new Date(Date.now() + 1000).toISOString() }),
    );
    mockedMercadopagoService.getQrOrderStatus.mockResolvedValue(makeQrStatus("created"));

    const { result } = setupHook();

    await act(async () => {
      await result.current.startQrPayment();
    });

    // Ticks a 3s y 6s: todavía dentro de expiresAt (1s) + gracia (5s) → consulta.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mockedMercadopagoService.getQrOrderStatus).toHaveBeenCalledTimes(2);

    // Tick a 9s: vencido → corta ANTES de consultar de nuevo.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mockedMercadopagoService.cancelQrOrder).toHaveBeenCalledWith("ORD01QR");
    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toBe(
      "El QR expiró sin que se registrara el pago. Generá uno nuevo.",
    );
    expect(mockedOrdersService.create).not.toHaveBeenCalled();

    // Polling detenido: no vuelve a consultar.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mockedMercadopagoService.getQrOrderStatus).toHaveBeenCalledTimes(2);
  });

  it("doble startQrPayment manda la MISMA idempotencyKey en ambos POSTs", async () => {
    mockedMercadopagoService.createQrOrder.mockResolvedValue(makeQrCreated());
    mockedMercadopagoService.getQrOrderStatus.mockResolvedValue(makeQrStatus("created"));

    const { result } = setupHook();

    await act(async () => {
      await result.current.startQrPayment();
    });
    await act(async () => {
      await result.current.startQrPayment();
    });

    expect(mockedMercadopagoService.createQrOrder).toHaveBeenCalledTimes(2);
    const [, , opts1] = mockedMercadopagoService.createQrOrder.mock.calls[0];
    const [, , opts2] = mockedMercadopagoService.createQrOrder.mock.calls[1];
    expect(opts1?.idempotencyKey).toBeTruthy();
    expect(opts2?.idempotencyKey).toBe(opts1?.idempotencyKey);
  });

  it("failed es terminal: corta el polling, muestra el mensaje y resetea la semilla", async () => {
    mockedMercadopagoService.createQrOrder.mockResolvedValue(makeQrCreated());
    mockedMercadopagoService.getQrOrderStatus.mockResolvedValue(makeQrStatus("failed"));

    const { result } = setupHook();

    await act(async () => {
      await result.current.startQrPayment();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toBe("El cobro falló en Mercado Pago.");
    expect(mockedOrdersService.create).not.toHaveBeenCalled();

    // Polling detenido.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mockedMercadopagoService.getQrOrderStatus).toHaveBeenCalledTimes(1);

    // Semilla reseteada: el próximo intento genera una key nueva.
    await act(async () => {
      await result.current.startQrPayment();
    });
    const [, , optsFirst] = mockedMercadopagoService.createQrOrder.mock.calls[0];
    const [, , optsSecond] = mockedMercadopagoService.createQrOrder.mock.calls[1];
    expect(optsSecond?.idempotencyKey).toBeTruthy();
    expect(optsSecond?.idempotencyKey).not.toBe(optsFirst?.idempotencyKey);
  });

  it("unknown NO es terminal: el polling sigue (acotado por expiresAt) sin marcar error", async () => {
    mockedMercadopagoService.createQrOrder.mockResolvedValue(makeQrCreated());
    mockedMercadopagoService.getQrOrderStatus.mockResolvedValue(makeQrStatus("unknown"));

    const { result } = setupHook();

    await act(async () => {
      await result.current.startQrPayment();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(mockedMercadopagoService.getQrOrderStatus).toHaveBeenCalledTimes(2);
    expect(result.current.posnetStatus).toBe("connecting");
    expect(result.current.paymentIntentState).toBe("unknown");
    expect(mockedOrdersService.create).not.toHaveBeenCalled();
  });

  it("retryPendingSale registra la venta pendiente y limpia la constancia", async () => {
    mockedMercadopagoService.createQrOrder.mockResolvedValue(makeQrCreated());
    mockedMercadopagoService.getQrOrderStatus.mockResolvedValue(makeQrStatus("processed"));
    mockedOrdersService.create.mockRejectedValueOnce(new Error("network down"));

    const { result } = setupHook();

    await act(async () => {
      await result.current.startQrPayment();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.pendingSales).toHaveLength(1);

    mockedOrdersService.create.mockResolvedValue(makeOrder({ paymentMethod: "qr" }));
    await act(async () => {
      await result.current.retryPendingSale(result.current.pendingSales[0].id);
    });

    expect(result.current.pendingSales).toEqual([]);
    expect(listPendingSales()).toEqual([]);
  });
});
