import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapPaymentStatusToNormalized, MercadoPagoService } from "./mercadopago.service.js";
import type { CredentialsResolverService } from "./credentials-resolver.service.js";

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
  let resolve: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    // El resolver (Fase 2) devuelve el token; por defecto el legacy "test-token".
    resolve = vi.fn().mockResolvedValue("test-token");
    const resolver = { resolve } as unknown as CredentialsResolverService;
    service = new MercadoPagoService(resolver);
    env.MP_ACCESS_TOKEN = "test-token";
    env.MP_POS_DEVICE_ID = "device-1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("createPaymentIntent", () => {
    it("crea la intencion de pago y devuelve el body de MP + metadata de lo enviado", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });

      const result = await service.createPaymentIntent(1000);

      expect(result).toMatchObject({ id: "intent-1", status: "OPEN", deviceIdUsed: "device-1" });
      expect(result.idempotencyKeyUsed).toBeTruthy();
      expect(result.externalReferenceUsed).toMatch(/^cocktrail-/);
      expect(fetch).toHaveBeenCalledWith(
        "https://api.mercadopago.com/point/integration-api/devices/device-1/payment-intents",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("manda el monto en CENTAVOS a la Point API (la conversion vive solo en este borde)", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });

      await service.createPaymentIntent(1500.5);

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.amount).toBe(150050);
    });

    it("lanza Conflict con el mensaje de MP cuando la respuesta no es ok", async () => {
      mockFetchOnce({ ok: false, status: 400, body: { message: "monto invalido", error: "bad_request" } });

      await expect(service.createPaymentIntent(1000)).rejects.toMatchObject({
        message: expect.stringContaining("Error al crear la intenci"),
      });
    });

    it("lanza Conflict sin llamar a fetch ni resolver token si falta el device", async () => {
      env.MP_POS_DEVICE_ID = "";

      await expect(service.createPaymentIntent(1000)).rejects.toBeTruthy();
      expect(fetch).not.toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
    });

    it("resuelve el token con el deviceId del contexto y lo usa en el Authorization", async () => {
      resolve.mockResolvedValueOnce("AT-device-9");
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });

      await service.createPaymentIntent(1000, undefined, "PAX_A910__DEVICE-9");

      expect(resolve).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: "PAX_A910__DEVICE-9", allowGlobalFallback: true }),
      );
      const call = vi.mocked(fetch).mock.calls[0];
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer AT-device-9");
    });

    it("manda un external_reference unico (timestamp + sufijo random) en additional_info", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });

      await service.createPaymentIntent(1000);

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.additional_info.external_reference).toMatch(/^cocktrail-\d+-[0-9a-f]{8}$/);
    });

    it("dos llamadas en el MISMO milisegundo generan external_reference distintos (UNIQUE en mp_orders)", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });
      mockFetchOnce({ ok: true, body: { id: "intent-2", status: "OPEN" } });

      const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(1000);
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

      // "Gin T\u00f3nic" = "Gin T?nic" (escape para mantener el archivo ASCII-safe).
      await service.createPaymentIntent(1000, "2x Fernet con Coca, 1x Gin T\u00f3nic");

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.additional_info.external_reference).toMatch(/^cocktrail-\d+-[0-9a-f]{8}-2x-Fernet-con-Coca-1x-Gin-Tonic$/);
      expect(body.additional_info.external_reference.length).toBeLessThanOrEqual(64);
    });

    it("manda X-Idempotency-Key en la request", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });

      await service.createPaymentIntent(1000);

      const call = vi.mocked(fetch).mock.calls[0];
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers["X-Idempotency-Key"]).toBeTruthy();
    });

    it("usa la idempotencyKey provista y la devuelve en idempotencyKeyUsed", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });

      const result = await service.createPaymentIntent(1000, undefined, undefined, "key-provista-123");

      const call = vi.mocked(fetch).mock.calls[0];
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers["X-Idempotency-Key"]).toBe("key-provista-123");
      expect(result.idempotencyKeyUsed).toBe("key-provista-123");
    });

    it("el reintento post-2205 usa una idempotency key NUEVA (es un intent nuevo)", async () => {
      mockFetchOnce({
        ok: false,
        status: 409,
        body: { message: "Device has a queued payment intent", error: "2205", payment_intent_id: "intent-vieja" },
      });
      mockFetchOnce({ ok: true, body: { status: "CANCELED" } }); // cancel
      mockFetchOnce({ ok: true, body: { id: "intent-nueva", status: "OPEN" } }); // retry

      const result = await service.createPaymentIntent(1000, undefined, undefined, "key-original-123");

      const firstHeaders = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      const retryHeaders = (vi.mocked(fetch).mock.calls[2][1] as RequestInit).headers as Record<string, string>;
      expect(firstHeaders["X-Idempotency-Key"]).toBe("key-original-123");
      expect(retryHeaders["X-Idempotency-Key"]).not.toBe("key-original-123");
      expect(result.idempotencyKeyUsed).toBe(retryHeaders["X-Idempotency-Key"]);
    });

    it("ante un 2205 con el id de la intencion en cola, la cancela y reintenta una vez", async () => {
      mockFetchOnce({
        ok: false,
        status: 409,
        body: { message: "Device has a queued payment intent", error: "2205", payment_intent_id: "intent-vieja" },
      });
      mockFetchOnce({ ok: true, body: { status: "CANCELED" } }); // cancelPaymentIntent
      mockFetchOnce({ ok: true, body: { id: "intent-nueva", status: "OPEN" } }); // reintento

      const result = await service.createPaymentIntent(1000);

      expect(result).toMatchObject({ id: "intent-nueva", status: "OPEN" });
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        "https://api.mercadopago.com/point/integration-api/devices/device-1/payment-intents/intent-vieja",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("timeout de la Point API: Conflict con mensaje claro y code MP_TIMEOUT", async () => {
      const timeoutErr = new Error("The operation was aborted due to timeout");
      timeoutErr.name = "TimeoutError";
      vi.mocked(fetch).mockRejectedValueOnce(timeoutErr);

      await expect(service.createPaymentIntent(1000)).rejects.toMatchObject({
        name: "Conflict",
        code: "MP_TIMEOUT",
        message: expect.stringContaining("no respondi"),
      });
    });

    it("manda AbortSignal (timeout por request individual) en el fetch", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: "OPEN" } });

      await service.createPaymentIntent(1000);

      const call = vi.mocked(fetch).mock.calls[0];
      expect((call[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    });

    it("ante un 2205 sin id de intencion en el error, propaga el error tal cual (sin inventar recuperacion)", async () => {
      mockFetchOnce({
        ok: false,
        status: 409,
        body: { message: "Device has a queued payment intent", error: "2205" },
      });

      await expect(service.createPaymentIntent(1000)).rejects.toMatchObject({
        message: expect.stringContaining("Error al crear la intenci"),
      });
      expect(fetch).toHaveBeenCalledTimes(1); // no reintenta sin poder cancelar la vieja
    });
  });

  describe("cancelPaymentIntent", () => {
    it("cancela la intencion de pago", async () => {
      mockFetchOnce({ ok: true, body: { status: "CANCELED" } });

      const result = await service.cancelPaymentIntent("intent-1");

      expect(result).toEqual({ status: "CANCELED" });
    });

    it("lanza Conflict cuando la respuesta no es ok", async () => {
      mockFetchOnce({ ok: false, status: 404 });

      await expect(service.cancelPaymentIntent("intent-1")).rejects.toMatchObject({
        message: expect.stringContaining("Error al cancelar la intenci"),
      });
    });
  });

  describe("checkDeviceConnection", () => {
    it("devuelve connected:false sin llamar a fetch si falta el device", async () => {
      env.MP_POS_DEVICE_ID = "";

      const result = await service.checkDeviceConnection();

      expect(result.connected).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("devuelve connected:false (no lanza) si el resolver no encuentra cuenta", async () => {
      resolve.mockRejectedValueOnce(new Error("No hay cuenta vinculada"));

      const result = await service.checkDeviceConnection();

      expect(result.connected).toBe(false);
      expect(result.message).toContain("No hay cuenta vinculada");
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

    it("detecta que el Posnet recibio la prueba (ON_TERMINAL) y NO intenta cancelarla por API", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-test", status: "OPEN" } }); // createPaymentIntent
      mockFetchOnce({ ok: true, body: { id: "intent-test", status: "ON_TERMINAL" } }); // 1er poll

      const promise = service.testDeviceReachability();
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result.reachedDevice).toBe(true);
      expect(result.message).toContain("desde el propio dispositivo");
      // MP responde 409 (error 103) si se intenta cancelar una intencion ya en ON_TERMINAL: no debe intentarlo.
      expect(fetch).toHaveBeenCalledTimes(2);
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
      expect(result.message).toContain("no respondi");
      const lastCall = vi.mocked(fetch).mock.calls.at(-1)!;
      expect(lastCall[1]).toMatchObject({ method: "DELETE" });
    });

    it("si falla crear la intencion de prueba, devuelve reachedDevice:false sin pollear", async () => {
      mockFetchOnce({ ok: false, status: 500, body: { message: "error de MP" } });

      const result = await service.testDeviceReachability();

      expect(result.reachedDevice).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("getPayment", () => {
    it("consulta la Payments API estandar", async () => {
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
    it.each(["OPEN", "ON_TERMINAL", "FINISHED", "CANCELED"])("sin payment.id pasa el status %s tal cual", async (rawStatus) => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", status: rawStatus } });

      const result = await service.getPaymentIntentStatus("intent-1");

      expect(result.status).toBe(rawStatus);
    });

    it("FINISHED con payment.id dispara un segundo fetch y decide con el pago real (R27)", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", state: "FINISHED", payment: { id: "payment-1" } } });
      mockFetchOnce({ ok: true, body: { id: "payment-1", status: "rejected", status_detail: "cc_rejected_insufficient_amount" } });

      const result = await service.getPaymentIntentStatus("intent-1");

      // Tarjeta sin fondos con state FINISHED: NUNCA puede volver como FINISHED.
      expect(result.status).toBe("CANCELED");
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("FINISHED con pago approved sigue siendo FINISHED (camino feliz, 2 fetches)", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", state: "FINISHED", payment: { id: "payment-1" } } });
      mockFetchOnce({ ok: true, body: { id: "payment-1", status: "approved" } });

      const result = await service.getPaymentIntentStatus("intent-1");

      expect(result.status).toBe("FINISHED");
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("resuelve CONFIRMATION_REQUIRED con pago approved como FINISHED, sin intervencion manual", async () => {
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

  describe("resolveIntentOutcome", () => {
    it("sin payment.id devuelve solo rawState + external_reference (1 fetch)", async () => {
      mockFetchOnce({
        ok: true,
        body: { id: "intent-1", state: "ON_TERMINAL", additional_info: { external_reference: "cocktrail-1-abc" } },
      });

      const outcome = await service.resolveIntentOutcome("intent-1");

      expect(outcome).toEqual({ rawState: "ON_TERMINAL", externalReference: "cocktrail-1-abc" });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("con payment.id consulta /v1/payments y devuelve el DTO completo (montos en pesos)", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", state: "FINISHED", payment: { id: "payment-1" } } });
      mockFetchOnce({
        ok: true,
        body: { id: "payment-1", status: "approved", status_detail: "accredited", transaction_amount: 101 },
      });

      const outcome = await service.resolveIntentOutcome("intent-1");

      expect(outcome).toMatchObject({
        rawState: "FINISHED",
        paymentId: "payment-1",
        paymentStatus: "approved",
        statusDetail: "accredited",
        transactionAmount: 101,
      });
    });

    it("pago rechazado: devuelve el status crudo con el detail, sin normalizar", async () => {
      mockFetchOnce({ ok: true, body: { id: "intent-1", state: "FINISHED", payment: { id: "payment-1" } } });
      mockFetchOnce({
        ok: true,
        body: { id: "payment-1", status: "rejected", status_detail: "cc_rejected_insufficient_amount" },
      });

      const outcome = await service.resolveIntentOutcome("intent-1");

      expect(outcome.paymentStatus).toBe("rejected");
      expect(outcome.statusDetail).toBe("cc_rejected_insufficient_amount");
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
