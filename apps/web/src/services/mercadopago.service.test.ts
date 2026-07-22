import { afterEach, describe, expect, it, vi } from "vitest";
import { mercadopagoService } from "./mercadopago.service";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("mercadopagoService", () => {
  it("getDeviceStatus hace GET a /api/mercadopago/device/status", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      connected: true,
      message: "Posnet vinculado y conectado.",
      device: { model: "Point Smart", serialNumber: "123", operatingMode: "PDV" },
    });

    const result = await mercadopagoService.getDeviceStatus();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/device/status");
    expect(result.connected).toBe(true);
  });

  it("testDeviceCharge hace POST a /api/mercadopago/device/test-charge", async () => {
    mockedApiFetch.mockResolvedValueOnce({ reachedDevice: true, message: "ok" });

    const result = await mercadopagoService.testDeviceCharge();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/device/test-charge", { method: "POST" });
    expect(result.reachedDevice).toBe(true);
  });

  it("createPosIntent hace POST a /api/mercadopago/pos/intent con amount/description", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "intent-1", expiresAt: "2026-07-22T03:00:00.000Z" });

    const result = await mercadopagoService.createPosIntent(5000, "2 Fernet");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/pos/intent", {
      method: "POST",
      body: { amount: 5000, description: "2 Fernet" },
    });
    expect(result).toEqual({ id: "intent-1", expiresAt: "2026-07-22T03:00:00.000Z" });
  });

  it("createPosIntent manda attemptId + items en el body cuando se le pasan", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "intent-1", expiresAt: "2026-07-22T03:00:00.000Z" });

    await mercadopagoService.createPosIntent(5000, "2 Fernet", {
      attemptId: "attempt-1234567890abcdef",
      items: [{ drinkId: 1, qty: 2 }],
    });

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/pos/intent", {
      method: "POST",
      body: {
        amount: 5000,
        description: "2 Fernet",
        attemptId: "attempt-1234567890abcdef",
        items: [{ drinkId: 1, qty: 2 }],
      },
    });
  });

  it("getPosIntentStatus hace GET a /api/mercadopago/pos/intent/:id", async () => {
    mockedApiFetch.mockResolvedValueOnce({ status: "PENDING", rawState: "ON_TERMINAL" });

    await mercadopagoService.getPosIntentStatus("intent-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/pos/intent/intent-1");
  });

  it("resolvePosIntent hace POST a /api/mercadopago/pos/intent/:id/resolve", async () => {
    mockedApiFetch.mockResolvedValueOnce({ status: "FINISHED", paymentId: "170034593080" });

    const result = await mercadopagoService.resolvePosIntent("intent-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/pos/intent/intent-1/resolve", {
      method: "POST",
    });
    expect(result).toEqual({ status: "FINISHED", paymentId: "170034593080" });
  });

  it("createQrOrder manda la idempotencyKey en el body cuando se le pasa", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      orderId: "ORD01QR",
      qrImage: null,
      status: "created",
      expiresAt: "2026-07-21T03:00:00.000Z",
    });

    await mercadopagoService.createQrOrder(5000, "2 Fernet", { idempotencyKey: "key-abc" });

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/orders/qr", {
      method: "POST",
      body: { amount: 5000, description: "2 Fernet", idempotencyKey: "key-abc" },
    });
  });

  it("cancelPosIntent hace DELETE a /api/mercadopago/pos/intent/:id", async () => {
    mockedApiFetch.mockResolvedValueOnce({ status: "cancelled" });

    await mercadopagoService.cancelPosIntent("intent-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/pos/intent/intent-1", {
      method: "DELETE",
    });
  });
});
