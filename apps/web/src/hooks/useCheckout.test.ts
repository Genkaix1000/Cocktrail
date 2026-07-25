import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useCheckout } from "./useCheckout";
import { listPendingSales } from "@/lib/pendingSales";
import { ApiError } from "@/services/api-client";
import {
  mercadopagoService,
  type MpQrOrderStatus,
  type PosIntentVerdict,
} from "@/services/mercadopago.service";
import { ordersService } from "@/services/orders.service";
import type { Drink, Order } from "@cocktrail/shared";

vi.mock("@/services/mercadopago.service", () => ({
  mercadopagoService: {
    createPosIntent: vi.fn(),
    getPosIntentStatus: vi.fn(),
    resolvePosIntent: vi.fn(),
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

/** Response del create Posnet con el deadline server-side a futuro (10 min, como el backend). */
function makePosCreated(overrides: Partial<{ id: string; expiresAt: string }> = {}) {
  return {
    id: "intent-1",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    ...overrides,
  };
}

function makePosVerdict(
  status: PosIntentVerdict["status"],
  extra: Partial<PosIntentVerdict> = {},
): PosIntentVerdict {
  return { status, ...extra };
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

  it("FINISHED crea el pedido con la prueba de pago + idempotencyKey y vuelve a idle", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(makePosVerdict("FINISHED"));
    mockedOrdersService.create.mockResolvedValue(makeOrder());

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });

    // El intent se crea con el attemptId (semilla) y los items del carrito
    // (respaldo server-side de la venta).
    expect(mockedMercadopagoService.createPosIntent).toHaveBeenCalledWith(
      2500,
      "Fernet con Coca x1",
      { attemptId: expect.any(String), items: [{ drinkId: 1, qty: 1 }] },
    );
    const attemptId = mockedMercadopagoService.createPosIntent.mock.calls[0][2]?.attemptId;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // El registro presenta la prueba de pago y reusa el attemptId como key de replay.
    expect(mockedOrdersService.create).toHaveBeenCalledWith({
      items: [{ drinkId: 1, qty: 1 }],
      paymentMethod: "debito",
      payment: { provider: "mercadopago", kind: "point_intent", id: "intent-1" },
      idempotencyKey: attemptId,
    });
    expect(result.current.posnetStatus).toBe("idle");
    expect(result.current.latestOrder).not.toBeNull();
  });

  it("CANCELED sigue siendo cancelación deliberada (sentinel), no un rechazo", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(makePosVerdict("CANCELED"));

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

  it("REJECTED por fondos insuficientes corta el polling y muestra el motivo real", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(
      makePosVerdict("REJECTED", { statusDetail: "cc_rejected_insufficient_amount", rawState: "FINISHED" }),
    );

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toBe(
      "Tarjeta rechazada: fondos insuficientes — pedile al cliente otro medio de pago",
    );
    expect(mockedOrdersService.create).not.toHaveBeenCalled();

    // Polling detenido: no vuelve a consultar.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mockedMercadopagoService.getPosIntentStatus).toHaveBeenCalledTimes(1);
  });

  it("REJECTED con un detail no mapeado muestra el rechazo genérico con el detalle", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(
      makePosVerdict("REJECTED", { statusDetail: "cc_rejected_bad_filled_security_code" }),
    );

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.posnetErrorMessage).toBe(
      "Tarjeta rechazada (cc_rejected_bad_filled_security_code). Pedile al cliente otro medio de pago.",
    );
    expect(mockedOrdersService.create).not.toHaveBeenCalled();
  });

  it("EXPIRED corta el polling con el sentinel de expiración, sin crear el pedido", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(makePosVerdict("EXPIRED"));

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toBe("intent_expired");
    expect(mockedOrdersService.create).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mockedMercadopagoService.getPosIntentStatus).toHaveBeenCalledTimes(1);
  });

  it("UNKNOWN NO es terminal ni cobrado: sigue consultando y lo muestra como advertencia", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(makePosVerdict("UNKNOWN"));

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(mockedMercadopagoService.getPosIntentStatus).toHaveBeenCalledTimes(2);
    expect(result.current.posnetStatus).not.toBe("error");
    expect(result.current.paymentIntentState).toBe("UNKNOWN");
    expect(mockedOrdersService.create).not.toHaveBeenCalled();
  });

  it.each([
    ["OPEN", "OPEN"],
    ["ON_TERMINAL", "ON_TERMINAL"],
    [undefined, "PENDING"],
  ] as const)(
    "PENDING con rawState %s sigue esperando y expone %s como estado visible",
    async (rawState, visible) => {
      mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
      mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(
        makePosVerdict("PENDING", rawState ? { rawState } : {}),
      );

      const { result } = setupHook();

      await act(async () => {
        await result.current.startPosnetPayment("debito");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(mockedOrdersService.create).not.toHaveBeenCalled();
      expect(result.current.posnetStatus).not.toBe("error");
      expect(result.current.paymentIntentState).toBe(visible);
    },
  );

  it("criterio F: pasado el expiresAt del create corta el polling localmente", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(
      makePosCreated({ expiresAt: new Date(Date.now() + 1000).toISOString() }),
    );
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(
      makePosVerdict("PENDING", { rawState: "OPEN" }),
    );

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });

    // Ticks a 3s y 6s: todavía dentro de expiresAt (1s) + gracia (5s) → consulta.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mockedMercadopagoService.getPosIntentStatus).toHaveBeenCalledTimes(2);

    // Tick a 9s: vencido → corta ANTES de consultar de nuevo.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(mockedMercadopagoService.cancelPosIntent).toHaveBeenCalledWith("intent-1");
    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toBe("intent_expired");
    expect(mockedOrdersService.create).not.toHaveBeenCalled();

    // Polling detenido: no vuelve a consultar.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mockedMercadopagoService.getPosIntentStatus).toHaveBeenCalledTimes(2);
  });

  it("si el deadline local corta tras un UNKNOWN, el mensaje es 'no confirmado' (D1), no expiración", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(
      makePosCreated({ expiresAt: new Date(Date.now() + 1000).toISOString() }),
    );
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(makePosVerdict("UNKNOWN"));

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toContain("panel de Mercado Pago");
    expect(mockedOrdersService.create).not.toHaveBeenCalled();
  });

  it("un error de red al consultar el estado marca posnetStatus en error", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
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

  it("409 POSNET_NOT_LINKED al crear el intent muestra el mensaje de caja sin Posnet (no rechazo de tarjeta)", async () => {
    mockedMercadopagoService.createPosIntent.mockRejectedValue(
      new ApiError(409, "Sin Posnet", { error: "Sin Posnet", code: "POSNET_NOT_LINKED" }),
    );

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });

    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toContain("no tiene Posnet vinculado");
    // Distinguible del rechazo de tarjeta: no menciona "Tarjeta rechazada".
    expect(result.current.posnetErrorMessage).not.toContain("Tarjeta rechazada");
  });

  it("409 POSNET_WRONG_ACCOUNT muestra el mensaje del backend (caso grave)", async () => {
    mockedMercadopagoService.createPosIntent.mockRejectedValue(
      new ApiError(409, "bloqueado", {
        error: "Cobro bloqueado: la plata entraría a OTRA cuenta.",
        code: "POSNET_WRONG_ACCOUNT",
      }),
    );

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });

    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toContain("entraría a OTRA cuenta");
  });

  it("cc_rejected_other_reason suma la pista del titular de la cuenta (no se puede pagar a uno mismo)", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(
      makePosVerdict("REJECTED", { statusDetail: "cc_rejected_other_reason" }),
    );

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toContain("no se puede pagar a uno mismo");
  });

  it("desmontar el componente con un intent activo lo cancela en el device", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(makePosVerdict("PENDING", { rawState: "OPEN" }));
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
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(makePosVerdict("FINISHED"));
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
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(makePosVerdict("PENDING", { rawState: "OPEN" }));
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
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(makePosVerdict("FINISHED"));
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
      mpKind: "point_intent",
      idempotencyKey: expect.any(String),
      amount: 2500,
      attempts: 1,
      lastError: "ECONNREFUSED",
    });
    expect(result.current.pendingSales[0].blocked).toBeUndefined();
    expect(listPendingSales()).toHaveLength(1);

    // El cobro ya está hecho: desmontar no debe cancelarlo en el device.
    unmount();
    expect(mockedMercadopagoService.cancelPosIntent).not.toHaveBeenCalled();
  });

  it("409 PAYMENT_REJECTED al registrar NO reintenta: marca la constancia y muestra el motivo", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(makePosVerdict("FINISHED"));
    const serverMsg = "Cobro rechazado: el pago fue rechazado por MP (cc_rejected_insufficient_amount). No se registró la venta.";
    mockedOrdersService.create.mockRejectedValue(
      new ApiError(409, serverMsg, { error: serverMsg, code: "PAYMENT_REJECTED" }),
    );

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // El mensaje es el motivo del server, nunca el genérico de "quedó guardada para reintentar".
    expect(result.current.posnetStatus).toBe("error");
    expect(result.current.posnetErrorMessage).toBe(serverMsg);
    expect(result.current.pendingSales).toHaveLength(1);
    expect(result.current.pendingSales[0].blocked).toEqual({
      code: "PAYMENT_REJECTED",
      reason: serverMsg,
    });

    // La constancia bloqueada no se reintenta: retryPendingSale es un no-op.
    mockedOrdersService.create.mockClear();
    let retried: boolean | undefined;
    await act(async () => {
      retried = await result.current.retryPendingSale(result.current.pendingSales[0].id);
    });
    expect(retried).toBe(false);
    expect(mockedOrdersService.create).not.toHaveBeenCalled();
  });

  it("409 PAYMENT_UNVERIFIED al registrar también bloquea la constancia (D1)", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue(makePosVerdict("FINISHED"));
    const serverMsg = "No se pudo confirmar el cobro: MP no respondió. La venta NO se registró — verificá el cobro y reintentá desde la constancia.";
    mockedOrdersService.create.mockRejectedValue(
      new ApiError(409, serverMsg, { error: serverMsg, code: "PAYMENT_UNVERIFIED" }),
    );

    const { result } = setupHook();

    await act(async () => {
      await result.current.startPosnetPayment("debito");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.posnetErrorMessage).toBe(serverMsg);
    expect(result.current.pendingSales[0].blocked).toEqual({
      code: "PAYMENT_UNVERIFIED",
      reason: serverMsg,
    });
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

    // El registro presenta la prueba de pago y reusa la semilla del intento como key.
    const [, , createOpts] = mockedMercadopagoService.createQrOrder.mock.calls[0];
    expect(mockedOrdersService.create).toHaveBeenCalledWith({
      items: [{ drinkId: 1, qty: 1 }],
      paymentMethod: "qr",
      payment: { provider: "mercadopago", kind: "qr_order", id: "ORD01QR" },
      idempotencyKey: createOpts?.idempotencyKey,
    });
    expect(result.current.posnetStatus).toBe("idle");
    expect(result.current.latestOrder).not.toBeNull();
    // La constancia se escribió tras el cobro confirmado y se removió al registrar OK.
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
      mpKind: "qr_order",
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

describe("useCheckout — confirmOrder (efectivo / cortesía)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function openCashCheckout() {
    const hook = setupHook();
    await act(async () => {
      hook.result.current.handleOpenCheckout();
      hook.result.current.setPaymentMethod("efectivo");
      hook.result.current.handleChangeCash("2500");
    });
    return hook;
  }

  it("manda idempotencyKey en el POST", async () => {
    mockedOrdersService.create.mockResolvedValue(makeOrder({ paymentMethod: "efectivo" }));
    const { result } = await openCashCheckout();

    await act(async () => {
      await result.current.confirmOrder();
    });

    expect(mockedOrdersService.create).toHaveBeenCalledWith({
      items: [{ drinkId: 1, qty: 1 }],
      paymentMethod: "efectivo",
      idempotencyKey: expect.any(String),
    });
  });

  it("reintento tras fallo de red reusa la misma key (no duplica la fantasma)", async () => {
    mockedOrdersService.create
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(makeOrder({ paymentMethod: "efectivo" }));

    const { result } = await openCashCheckout();

    await act(async () => {
      await result.current.confirmOrder();
    });
    expect(result.current.saleError).toBe("network down");

    await act(async () => {
      await result.current.confirmOrder();
    });

    expect(mockedOrdersService.create).toHaveBeenCalledTimes(2);
    const key1 = mockedOrdersService.create.mock.calls[0][0].idempotencyKey;
    const key2 = mockedOrdersService.create.mock.calls[1][0].idempotencyKey;
    expect(key1).toBeTruthy();
    expect(key2).toBe(key1);
    expect(result.current.latestOrder).not.toBeNull();
  });

  it("tras un cobro OK, el próximo intento genera key nueva", async () => {
    mockedOrdersService.create.mockResolvedValue(makeOrder({ paymentMethod: "efectivo" }));
    const { result } = await openCashCheckout();

    await act(async () => {
      await result.current.confirmOrder();
    });
    const keyFirst = mockedOrdersService.create.mock.calls[0][0].idempotencyKey;

    // Nueva venta: reabrir checkout (como hace la UI) + rearmar monto.
    await act(async () => {
      result.current.handleOpenCheckout();
      result.current.setPaymentMethod("efectivo");
      result.current.handleChangeCash("2500");
    });
    await act(async () => {
      await result.current.confirmOrder();
    });

    const keySecond = mockedOrdersService.create.mock.calls[1][0].idempotencyKey;
    expect(keySecond).toBeTruthy();
    expect(keySecond).not.toBe(keyFirst);
  });
});
