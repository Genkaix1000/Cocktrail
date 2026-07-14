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

    it("manda un external_reference único (basado en timestamp) en additional_info", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });

      await service.createPaymentIntent(1000);

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.additional_info.external_reference).toMatch(/^cocktrail-\d+$/);
    });

    it("dos llamadas seguidas generan external_reference distintos", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });
      mockFetchOnce({ ok: true, body: { id: "intent-2", status: "OPEN" } });

      const dateNowSpy = vi.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValueOnce(2000);
      await service.createPaymentIntent(1000);
      await service.createPaymentIntent(1000);
      dateNowSpy.mockRestore();

      const [firstCall, secondCall] = vi.mocked(fetch).mock.calls;
      const firstBody = JSON.parse((firstCall[1] as RequestInit).body as string);
      const secondBody = JSON.parse((secondCall[1] as RequestInit).body as string);
      expect(firstBody.additional_info.external_reference).not.toBe(secondBody.additional_info.external_reference);
    });

    it("manda la description saneada (sin acentos ni espacios) dentro de external_reference", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });

      await service.createPaymentIntent(1000, "2x Fernet con Coca, 1x Gin Tónic");

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.additional_info.external_reference).toMatch(/^cocktrail-\d+-2x-Fernet-con-Coca-1x-Gin-Tonic$/);
      expect(body.additional_info.external_reference.length).toBeLessThanOrEqual(64);
    });

    it("manda X-Idempotency-Key en la request", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });

      await service.createPaymentIntent(1000);

      const call = vi.mocked(fetch).mock.calls[0];
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers["X-Idempotency-Key"]).toBeTruthy();
    });

    it("ante un 2205 con el id de la intención en cola, la cancela y reintenta una vez", async () => {
      mockFetchOnce({
        ok: false,
        status: 409,
        body: { message: "Device has a queued payment intent", error: "2205", payment_intent_id: "intent-vieja" },
      });
      mockFetchOnce({ ok: true, body: { status: "CANCELED" } }); // cancelPaymentIntent
      mockFetchOnce({ ok: true, body: { id: "intent-nueva", status: "OPEN" } }); // reintento

      const result = await service.createPaymentIntent(1000);

      expect(result).toEqual({ id: "intent-nueva", status: "OPEN" });
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        "https://api.mercadopago.com/point/integration-api/devices/device-1/payment-intents/intent-vieja",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("ante un 2205 sin id de intención en el error, propaga el error tal cual (sin inventar recuperación)", async () => {
      mockFetchOnce({
        ok: false,
        status: 409,
        body: { message: "Device has a queued payment intent", error: "2205" },
      });

      await expect(service.createPaymentIntent(1000)).rejects.toMatchObject({
        message: expect.stringContaining("Error al crear la intención de pago en el Posnet"),
      });
      expect(fetch).toHaveBeenCalledTimes(1); // no reintenta sin poder cancelar la vieja
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

  describe("testDeviceReachability", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("detecta que el Posnet recibió la prueba (deja de estar OPEN) y la cancela", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-test", status: "OPEN" } }); // createPaymentIntent
      mockFetchOnce({ ok: true, body: { id: "intent-test", status: "ON_TERMINAL" } }); // 1er poll
      mockFetchOnce({ ok: true, body: { status: "CANCELED" } }); // cancelPaymentIntent

      const promise = service.testDeviceReachability();
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result).toEqual({ reachedDevice: true, message: "El Posnet recibió la prueba correctamente. Listo para cobrar." });
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        "https://api.mercadopago.com/point/integration-api/devices/device-1/payment-intents/intent-test",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("si el device no responde en 15s, devuelve reachedDevice:false y cancela igual", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-test", status: "OPEN" } }); // create
      for (let i = 0; i < 10; i++) {
        mockFetchOnce({ ok: true, body: { id: "intent-test", status: "OPEN" } }); // polls: nunca cambia
      }
      mockFetchOnce({ ok: true, body: { status: "CANCELED" } }); // cancel final

      const promise = service.testDeviceReachability();
      await vi.advanceTimersByTimeAsync(16000);
      const result = await promise;

      expect(result.reachedDevice).toBe(false);
      expect(result.message).toContain("no respondió");
      const lastCall = vi.mocked(fetch).mock.calls.at(-1)!;
      expect(lastCall[1]).toMatchObject({ method: "DELETE" });
    });

    it("si falla crear la intención de prueba, devuelve reachedDevice:false sin pollear", async () => {
      mockFetchOnce({ ok: false, status: 500, body: { message: "error de MP" } });

      const result = await service.testDeviceReachability();

      expect(result.reachedDevice).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
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
