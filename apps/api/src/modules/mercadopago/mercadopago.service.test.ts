import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapPaymentStatusToNormalized, MercadoPagoService } from "./mercadopago.service.js";

vi.mock("../../config/env.js", () => ({
  env: {
    MP_ACCESS_TOKEN: "test-token",
    MP_POS_DEVICE_ID: "device-1",
  },
}));

import { env } from "../../config/env.js";

function mockFetchOnce(response: { ok: boolean; status?: number; body?: unknown }) {
  const mockRes = {
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    statusText: "Error",
    json: vi.fn().mockResolvedValue(response.body ?? {}),
  };
  vi.mocked(fetch).mockResolvedValueOnce(mockRes as unknown as Response);
  return mockRes;
}

describe("MercadoPagoService", () => {
  let service: MercadoPagoService;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    service = new MercadoPagoService();
    env.MP_ACCESS_TOKEN = "test-token";
    env.MP_POS_DEVICE_ID = "device-1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("createPaymentIntent", () => {
    it("crea la intención de pago y devuelve el body de MP", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });

      const result = await service.createPaymentIntent(1000);

      expect(result).toEqual({ id: "intent-1", status: "OPEN" });
      expect(fetch).toHaveBeenCalledWith(
        "https://api.mercadopago.com/point/integration-api/devices/device-1/payment-intents",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("lanza Conflict con el mensaje de MP cuando la respuesta no es ok", async () => {
      mockFetchOnce({ ok: false, status: 400, body: { message: "monto inválido", error: "bad_request" } });

      await expect(service.createPaymentIntent(1000)).rejects.toMatchObject({
        message: expect.stringContaining("Error al crear la intención de pago en el Posnet"),
      });
    });

    it("lanza Conflict sin llamar a fetch si falta configuración", async () => {
      env.MP_ACCESS_TOKEN = "";

      await expect(service.createPaymentIntent(1000)).rejects.toBeTruthy();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("cancelPaymentIntent", () => {
    it("cancela la intención de pago", async () => {
      mockFetchOnce({ ok: true, body: { status: "CANCELED" } });

      const result = await service.cancelPaymentIntent("intent-1");

      expect(result).toEqual({ status: "CANCELED" });
    });

    it("lanza Conflict cuando la respuesta no es ok", async () => {
      mockFetchOnce({ ok: false, status: 404 });

      await expect(service.cancelPaymentIntent("intent-1")).rejects.toMatchObject({
        message: expect.stringContaining("Error al cancelar la intención de pago en el Posnet"),
      });
    });
  });

  describe("checkDeviceConnection", () => {
    it("devuelve connected:false sin llamar a fetch si falta configuración", async () => {
      env.MP_ACCESS_TOKEN = "";

      const result = await service.checkDeviceConnection();

      expect(result.connected).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("devuelve connected:true cuando el device vinculado aparece en la lista", async () => {
      mockFetchOnce({
        ok: true,
        body: { devices: [{ id: "device-1", model: "Point Smart 2", serial_number: "SN1", operating_mode: "PDV" }] },
      });

      const result = await service.checkDeviceConnection();

      expect(result).toEqual({
        connected: true,
        message: "Posnet vinculado y conectado.",
        device: { model: "Point Smart 2", serialNumber: "SN1", operatingMode: "PDV" },
      });
    });

    it("devuelve connected:false cuando el device no aparece en la lista", async () => {
      mockFetchOnce({ ok: true, body: { devices: [{ id: "otro-device" }] } });

      const result = await service.checkDeviceConnection();

      expect(result.connected).toBe(false);
    });

    it("devuelve connected:false ante un error HTTP (no lanza)", async () => {
      mockFetchOnce({ ok: false, status: 500 });

      const result = await service.checkDeviceConnection();

      expect(result.connected).toBe(false);
    });

    it("devuelve connected:false ante un error de red (no lanza)", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));

      const result = await service.checkDeviceConnection();

      expect(result.connected).toBe(false);
      expect(result.message).toContain("Error de red");
    });
  });

  describe("getPayment", () => {
    it("consulta la Payments API estándar", async () => {
      mockFetchOnce({ ok: true, body: { id: "payment-1", status: "approved" } });

      const result = await service.getPayment("payment-1");

      expect(result).toEqual({ id: "payment-1", status: "approved" });
      expect(fetch).toHaveBeenCalledWith(
        "https://api.mercadopago.com/v1/payments/payment-1",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("lanza Conflict cuando la respuesta no es ok", async () => {
      mockFetchOnce({ ok: false, status: 404 });

      await expect(service.getPayment("payment-1")).rejects.toMatchObject({
        message: expect.stringContaining("Error al consultar el pago en Mercado Pago"),
      });
    });
  });

  describe("getPaymentIntentStatus", () => {
    it.each(["OPEN", "ON_TERMINAL", "FINISHED", "CANCELED"])("pasa el status %s tal cual", async (rawStatus) => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: rawStatus } });

      const result = await service.getPaymentIntentStatus("intent-1");

      expect(result.status).toBe(rawStatus);
    });

    it("resuelve CONFIRMATION_REQUIRED con pago approved como FINISHED, sin intervención manual", async () => {
      mockFetchOnce({ ok: true, body: { status: "CONFIRMATION_REQUIRED", payment: { id: "payment-1" } } });
      mockFetchOnce({ ok: true, body: { id: "payment-1", status: "approved" } });

      const result = await service.getPaymentIntentStatus("intent-1");

      expect(result.status).toBe("FINISHED");
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it.each(["rejected", "cancelled"])("resuelve CONFIRMATION_REQUIRED con pago %s como CANCELED", async (mpStatus) => {
      mockFetchOnce({ ok: true, body: { status: "CONFIRMATION_REQUIRED", payment: { id: "payment-1" } } });
      mockFetchOnce({ ok: true, body: { id: "payment-1", status: mpStatus } });

      const result = await service.getPaymentIntentStatus("intent-1");

      expect(result.status).toBe("CANCELED");
    });

    it.each(["pending", "in_process"])("resuelve CONFIRMATION_REQUIRED con pago %s como PENDING", async (mpStatus) => {
      mockFetchOnce({ ok: true, body: { status: "CONFIRMATION_REQUIRED", payment: { id: "payment-1" } } });
      mockFetchOnce({ ok: true, body: { id: "payment-1", status: mpStatus } });

      const result = await service.getPaymentIntentStatus("intent-1");

      expect(result.status).toBe("PENDING");
    });

    it("lanza Conflict cuando la respuesta no es ok", async () => {
      mockFetchOnce({ ok: false, status: 500 });

      await expect(service.getPaymentIntentStatus("intent-1")).rejects.toMatchObject({
        message: expect.stringContaining("Error al consultar estado del Posnet en Mercado Pago"),
      });
    });
  });
});

describe("mapPaymentStatusToNormalized", () => {
  it("mapea approved a FINISHED", () => {
    expect(mapPaymentStatusToNormalized("approved")).toBe("FINISHED");
  });

  it.each(["rejected", "cancelled"])("mapea %s a CANCELED", (status) => {
    expect(mapPaymentStatusToNormalized(status)).toBe("CANCELED");
  });

  it.each(["pending", "in_process", "authorized"])("mapea %s a PENDING", (status) => {
    expect(mapPaymentStatusToNormalized(status)).toBe("PENDING");
  });
});
