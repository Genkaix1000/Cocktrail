import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NightEvent } from "@cocktrail/shared";
import { MercadoPagoOrdersService } from "./mercadopago-orders.service.js";
import type { BarsRepository, Bar } from "./bars.repository.js";
import type { MercadoPagoCajasRepository, Caja } from "./mercadopago-cajas.repository.js";
import type { MpOrder, MpOrdersRepository } from "./mp-orders.repository.js";
import type { CredentialsResolverService } from "./credentials-resolver.service.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";

const STABLE_KEY = "11111111-2222-4333-8444-555555555555";

function makeEvent(overrides: Partial<NightEvent> = {}): NightEvent {
  return {
    id: "event-1",
    status: "activo",
    startedAt: Date.now(),
    orderCounter: 0,
    ...overrides,
  };
}

function makeBar(overrides: Partial<Bar> = {}): Bar {
  return {
    id: "bar-uuid-1",
    name: "Barra VIP",
    code: "BARRA-01",
    enabled: true,
    createdAt: "2026-07-17T00:00:00Z",
    ...overrides,
  };
}

function makeCaja(overrides: Partial<Caja> = {}): Caja {
  return {
    id: "caja-1",
    barId: "bar-uuid-1",
    storeId: "1234567",
    externalPosId: "COCKTRAILBAR01",
    posIdMp: "2711382",
    qrImage: "https://mp.example/qr.png",
    qrTemplate: "https://mp.example/qr.pdf",
    sellerUserId: "seller-1",
    storeName: null,
    createdAt: "2026-07-17T00:00:00Z",
    ...overrides,
  };
}

function makeMpOrder(overrides: Partial<MpOrder> = {}): MpOrder {
  return {
    id: "local-1",
    orderIdMp: "ORD01ABC",
    externalRef: "COCKTRAIL-xyz-abcd",
    idempotencyKey: "idem-1",
    paymentTransactionId: "PAY01TXN",
    paymentId: null,
    amount: 1500,
    status: "created",
    type: "qr",
    barId: "bar-uuid-1",
    cajaId: "caja-1",
    eventId: "event-1",
    qrData: "https://mp.example/qr.png",
    expiresAt: "2026-07-17T00:15:00Z",
    deviceId: null,
    attemptId: null,
    rawState: null,
    paymentStatus: null,
    paymentStatusDetail: null,
    paidAmount: null,
    netReceivedAmount: null,
    mpFeeAmount: null,
    feeStatus: "none",
    verifiedAt: null,
    verificationError: null,
    cartItems: null,
    createdAt: "2026-07-17T00:00:00Z",
    updatedAt: "2026-07-17T00:00:00Z",
    ...overrides,
  };
}

function mockFetchOk(body: unknown) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: "OK",
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
}

function mockFetchFail(status: number, body: unknown = { message: "fail", error: "x" }) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status,
    statusText: "Error",
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
}

describe("MercadoPagoOrdersService", () => {
  let barsRepo: BarsRepository;
  let cajasRepo: MercadoPagoCajasRepository;
  let mpOrdersRepo: MpOrdersRepository;
  let credentialsResolver: CredentialsResolverService;
  let getActiveEvent: ReturnType<typeof vi.fn>;
  let service: MercadoPagoOrdersService;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());

    barsRepo = {
      findByCode: vi.fn().mockResolvedValue(makeBar()),
      findById: vi.fn().mockResolvedValue(makeBar()),
      listAll: vi.fn().mockResolvedValue([makeBar()]),
      findOrCreateByCode: vi.fn().mockResolvedValue(makeBar()),
      setEnabled: vi.fn(async (id, enabled) => makeBar({ id, enabled })),
    };

    cajasRepo = {
      findById: vi.fn(),
      findByBarId: vi.fn().mockResolvedValue(makeCaja()),
      findBySellerUserId: vi.fn(),
      listAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateProvisioning: vi.fn(),
      deleteById: vi.fn(),
    };

    mpOrdersRepo = {
      create: vi.fn().mockImplementation(async (input) =>
        makeMpOrder({
          orderIdMp: input.orderIdMp,
          externalRef: input.externalRef,
          idempotencyKey: input.idempotencyKey,
          paymentTransactionId: input.paymentTransactionId ?? null,
          amount: Number(input.amount),
          status: input.status,
          type: input.type,
          barId: input.barId ?? null,
          cajaId: input.cajaId ?? null,
          eventId: input.eventId ?? null,
          qrData: input.qrData ?? null,
          expiresAt: input.expiresAt ?? null,
        }),
      ),
      findByMpId: vi.fn(),
      findByPaymentId: vi.fn(),
      findByExternalRef: vi.fn(),
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      findByAttemptId: vi.fn().mockResolvedValue(null),
      findProcessedPendingFees: vi.fn().mockResolvedValue([]),
      listRecent: vi.fn().mockResolvedValue([]),
      sumFeesForEvent: vi.fn().mockResolvedValue({
        mpFeeTotal: 0,
        mpNetTotal: 0,
        pendingFees: 0,
        mpQrPaid: 0,
        mpDebitoPaid: 0,
      }),
      update: vi.fn().mockImplementation(async (orderIdMp, patch) => {
        const prev = (await vi.mocked(mpOrdersRepo.findByMpId).getMockImplementation()?.(orderIdMp)) ??
          makeMpOrder({ orderIdMp });
        const next = makeMpOrder({ ...prev, orderIdMp, ...patch });
        vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(next);
        return next;
      }),
      updateStatus: vi.fn().mockImplementation(async (orderIdMp, status) =>
        makeMpOrder({ orderIdMp, status }),
      ),
    };

    credentialsResolver = {
      resolve: vi.fn().mockResolvedValue("AT-test"),
    } as unknown as CredentialsResolverService;

    getActiveEvent = vi.fn().mockResolvedValue(makeEvent());

    service = new MercadoPagoOrdersService(
      credentialsResolver,
      barsRepo,
      cajasRepo,
      mpOrdersRepo,
      getActiveEvent as () => Promise<NightEvent | null>,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("createQrOrder", () => {
    it("crea la order en MP y la persiste localmente", async () => {
      const emv = "00020101021243650016com.mercadolibre020130636test";
      mockFetchOk({
        id: "ORD01NEW",
        status: "created",
        transactions: { payments: [{ id: "PAY01TXN", amount: "1500.00" }] },
        type_response: { qr_data: emv },
      });

      const result = await service.createQrOrder({
        amount: 1500,
        barId: "BARRA-01",
        description: "Mesa 3",
      });

      expect(result).toMatchObject({
        orderId: "ORD01NEW",
        qrImage: emv,
        status: "created",
      });
      expect(result.expiresAt).toBeTruthy();

      expect(credentialsResolver.resolve).toHaveBeenCalledWith({
        barId: "bar-uuid-1",
        allowGlobalFallback: true,
        useGhost: false,
      });
      expect(mpOrdersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderIdMp: "ORD01NEW",
          paymentTransactionId: "PAY01TXN",
          status: "created",
          type: "qr",
          barId: "bar-uuid-1",
          cajaId: "caja-1",
          amount: "1500.00",
          qrData: emv,
        }),
      );

      const [url, init] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toBe("https://api.mercadopago.com/v1/orders");
      const body = JSON.parse(String((init as RequestInit).body));
      expect(body).toMatchObject({
        type: "qr",
        total_amount: "1500.00",
        config: { qr: { external_pos_id: "COCKTRAILBAR01", mode: "dynamic" } },
      });
      expect(body.external_reference).toMatch(/^COCKTRAIL-/);
      expect(body.external_reference.length).toBeLessThanOrEqual(64);
    });

    it("409 si MP no devuelve type_response.qr_data", async () => {
      mockFetchOk({
        id: "ORD01NOQR",
        status: "created",
        transactions: { payments: [{ id: "PAY01TXN", amount: "100.00" }] },
      });
      await expect(service.createQrOrder({ amount: 100, barId: "BARRA-01" })).rejects.toMatchObject({
        name: "Conflict",
        code: "QR_DATA_MISSING",
      });
      expect(mpOrdersRepo.create).not.toHaveBeenCalled();
    });

    it("409 si la barra no tiene caja provisionada", async () => {
      vi.mocked(cajasRepo.findByBarId).mockResolvedValue(null);
      await expect(service.createQrOrder({ amount: 100, barId: "BARRA-01" })).rejects.toBeInstanceOf(
        Conflict,
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("400 si amount es inválido", async () => {
      await expect(service.createQrOrder({ amount: 0 })).rejects.toBeInstanceOf(BadRequest);
      await expect(service.createQrOrder({ amount: -5 })).rejects.toBeInstanceOf(BadRequest);
    });

    it("mapea pos_not_found a Conflict con code POS_NOT_FOUND", async () => {
      mockFetchFail(400, { message: "pos_not_found", error: "pos_not_found" });
      await expect(service.createQrOrder({ amount: 100, barId: "BARRA-01" })).rejects.toMatchObject({
        name: "Conflict",
        code: "POS_NOT_FOUND",
      });
    });

    it("409 sin tocar MP si no hay una noche abierta", async () => {
      getActiveEvent.mockResolvedValue(null);
      await expect(service.createQrOrder({ amount: 100 })).rejects.toMatchObject({
        name: "Conflict",
        code: "NO_ACTIVE_EVENT",
        message: expect.stringContaining("No hay una noche abierta"),
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(mpOrdersRepo.create).not.toHaveBeenCalled();
    });

    it("409 sin tocar MP si la noche es de prueba: solo efectivo", async () => {
      getActiveEvent.mockResolvedValue(makeEvent({ isTest: true }));
      await expect(service.createQrOrder({ amount: 100 })).rejects.toMatchObject({
        name: "Conflict",
        code: "TEST_NIGHT",
        message: "Noche de prueba: solo efectivo.",
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(mpOrdersRepo.create).not.toHaveBeenCalled();
    });

    it("409 si la noche existe pero está cerrada", async () => {
      getActiveEvent.mockResolvedValue(makeEvent({ status: "cerrado" }));
      await expect(service.createQrOrder({ amount: 100 })).rejects.toBeInstanceOf(Conflict);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("usa la idempotencyKey del frontend en el header y deriva external_ref estable", async () => {
      mockFetchOk({
        id: "ORD01NEW",
        status: "created",
        type_response: { qr_data: "00020101021243650016com.mercadolibre020130636idem" },
      });

      await service.createQrOrder({ amount: 1500, idempotencyKey: STABLE_KEY });

      const [, init] = vi.mocked(fetch).mock.calls[0]!;
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers["X-Idempotency-Key"]).toBe(STABLE_KEY);
      const body = JSON.parse(String((init as RequestInit).body));
      expect(body.external_reference).toBe(`COCKTRAIL-${STABLE_KEY}`.slice(0, 64));
    });

    it("persiste event_id, qr_data y expires_at al crear", async () => {
      const emv = "00020101021243650016com.mercadolibre020130636persist";
      mockFetchOk({
        id: "ORD01NEW",
        status: "created",
        type_response: { qr_data: emv },
      });

      const result = await service.createQrOrder({ amount: 1500 });

      expect(mpOrdersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "event-1",
          qrData: emv,
          expiresAt: result.expiresAt,
        }),
      );
    });

    it("key repetida + mismo monto: devuelve la order existente sin tocar MP", async () => {
      vi.mocked(mpOrdersRepo.findByIdempotencyKey).mockResolvedValue(
        makeMpOrder({ idempotencyKey: STABLE_KEY, amount: 1500 }),
      );

      const result = await service.createQrOrder({ amount: 1500, idempotencyKey: STABLE_KEY });

      expect(result).toMatchObject({
        orderId: "ORD01ABC",
        qrImage: "https://mp.example/qr.png",
        status: "created",
        expiresAt: "2026-07-17T00:15:00Z",
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(mpOrdersRepo.create).not.toHaveBeenCalled();
    });

    it("key repetida + monto distinto: 409 IDEMPOTENCY_AMOUNT_MISMATCH", async () => {
      vi.mocked(mpOrdersRepo.findByIdempotencyKey).mockResolvedValue(
        makeMpOrder({ idempotencyKey: STABLE_KEY, amount: 1500 }),
      );

      await expect(
        service.createQrOrder({ amount: 2000, idempotencyKey: STABLE_KEY }),
      ).rejects.toMatchObject({ name: "Conflict", code: "IDEMPOTENCY_AMOUNT_MISMATCH" });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("carrera de 2 POSTs: el insert choca con el UNIQUE (23505) y devuelve la fila que ganó", async () => {
      mockFetchOk({
        id: "ORD01NEW",
        status: "created",
        type_response: { qr_data: "00020101021243650016com.mercadolibre020130636race" },
      });
      vi.mocked(mpOrdersRepo.create).mockRejectedValueOnce(
        Object.assign(new Error("duplicate key value"), { code: "23505" }),
      );
      vi.mocked(mpOrdersRepo.findByIdempotencyKey)
        .mockResolvedValueOnce(null) // lookup previo: todavía no existía
        .mockResolvedValueOnce(makeMpOrder({ idempotencyKey: STABLE_KEY, amount: 1500 }));

      const result = await service.createQrOrder({ amount: 1500, idempotencyKey: STABLE_KEY });

      expect(result.orderId).toBe("ORD01ABC");
    });

    it("timeout de MP: Conflict con mensaje claro y code MP_TIMEOUT", async () => {
      const timeoutErr = new Error("The operation was aborted due to timeout");
      timeoutErr.name = "TimeoutError";
      vi.mocked(fetch).mockRejectedValueOnce(timeoutErr);

      await expect(service.createQrOrder({ amount: 1500 })).rejects.toMatchObject({
        name: "Conflict",
        code: "MP_TIMEOUT",
        message: expect.stringContaining("no respondió"),
      });
      expect(mpOrdersRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("getOrderStatus", () => {
    it("devuelve directo si el estado local ya es final", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(
        makeMpOrder({ status: "processed", paymentId: "12345", feeStatus: "ready", netReceivedAmount: 1480, mpFeeAmount: 20 }),
      );

      const result = await service.getOrderStatus("ORD01ABC");
      expect(result.status).toBe("processed");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("al concretar verifica el monto y persiste paid_amount + payment_id (reference_id)", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(makeMpOrder({ amount: 1500 }));
      mockFetchOk({
        id: "ORD01ABC",
        status: "processed",
        transactions: {
          payments: [{ id: "PAY01TXN", reference_id: "99887766", status: "processed", amount: "1500.00" }],
        },
      });
      // enrichFees: GET /v1/payments/{id}
      mockFetchOk({
        id: "99887766",
        status: "approved",
        transaction_amount: 1500,
        transaction_details: { net_received_amount: 1480 },
      });

      const result = await service.getOrderStatus("ORD01ABC");
      expect(mpOrdersRepo.update).toHaveBeenCalledWith(
        "ORD01ABC",
        expect.objectContaining({
          status: "processed",
          paymentId: "99887766",
          paidAmount: 1500,
          feeStatus: "pending",
          verifiedAt: expect.any(String),
          verificationError: null,
        }),
      );
      expect(mpOrdersRepo.update).toHaveBeenCalledWith(
        "ORD01ABC",
        expect.objectContaining({
          netReceivedAmount: 1480,
          mpFeeAmount: 20,
          feeStatus: "ready",
        }),
      );
      expect(result.status).toBe("processed");
      expect(result.feeStatus).toBe("ready");
    });

    it("processed sin monto/payment_id verificable queda unknown, nunca concretado (criterio B)", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(makeMpOrder({ amount: 1500 }));
      mockFetchOk({
        id: "ORD01ABC",
        status: "processed",
        transactions: { payments: [{ id: "PAY01TXN", status: "processed" }] },
      });

      await service.getOrderStatus("ORD01ABC");
      expect(mpOrdersRepo.update).toHaveBeenCalledWith(
        "ORD01ABC",
        expect.objectContaining({
          status: "unknown",
          verificationError: expect.stringContaining("sin payment_id/monto"),
        }),
      );
    });

    it("processed con monto distinto al solicitado queda unknown con el detalle", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(makeMpOrder({ amount: 1500 }));
      mockFetchOk({
        id: "ORD01ABC",
        status: "processed",
        transactions: {
          payments: [{ id: "PAY01TXN", reference_id: "99887766", amount: "900.00" }],
        },
      });

      await service.getOrderStatus("ORD01ABC");
      expect(mpOrdersRepo.update).toHaveBeenCalledWith(
        "ORD01ABC",
        expect.objectContaining({
          status: "unknown",
          paidAmount: 900,
          verificationError: expect.stringContaining("distinto del solicitado"),
        }),
      );
    });

    it("404 si la order no existe localmente", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(null);
      await expect(service.getOrderStatus("ORD-MISSING")).rejects.toBeInstanceOf(NotFound);
    });

    it("failed es terminal: devuelve directo sin consultar a MP", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(makeMpOrder({ status: "failed" }));

      const result = await service.getOrderStatus("ORD01ABC");
      expect(result.status).toBe("failed");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("action_required NO es terminal: sigue consultando a MP", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(
        makeMpOrder({ status: "action_required" }),
      );
      mockFetchOk({ id: "ORD01ABC", status: "action_required" });

      await service.getOrderStatus("ORD01ABC");
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mpOrdersRepo.update).toHaveBeenCalledWith("ORD01ABC", {
        status: "action_required",
      });
    });

    it("estado desconocido de MP se registra como unknown (no created) con log warn", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(makeMpOrder());
      mockFetchOk({ id: "ORD01ABC", status: "estado_inventado" });

      await service.getOrderStatus("ORD01ABC");
      expect(mpOrdersRepo.update).toHaveBeenCalledWith("ORD01ABC", { status: "unknown" });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("estado_inventado"));
      warnSpy.mockRestore();
    });
  });

  describe("reconcileFromMp", () => {
    it("consulta MP y actualiza mp_orders (webhook / conciliación)", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(makeMpOrder({ amount: 1500 }));
      mockFetchOk({
        id: "ORD01ABC",
        status: "processed",
        type: "qr",
        status_detail: "accredited",
        transactions: {
          payments: [{ id: "PAY01TXN", reference_id: "99887766", amount: "1500.00" }],
        },
      });

      const result = await service.reconcileFromMp("ORD01ABC");
      expect(result).toMatchObject({
        mpType: "qr",
        statusDetail: "accredited",
        mpOrder: expect.objectContaining({ status: "processed" }),
      });
      expect(mpOrdersRepo.update).toHaveBeenCalledWith(
        "ORD01ABC",
        expect.objectContaining({
          status: "processed",
          paymentId: "99887766",
          paidAmount: 1500,
        }),
      );
    });

    it("devuelve null si la order no existe localmente", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(null);
      const result = await service.reconcileFromMp("ORD-MISSING");
      expect(result).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("cancelQrOrder", () => {
    it("cancela en MP y marca canceled localmente", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(makeMpOrder());
      mockFetchOk({ id: "ORD01ABC", status: "canceled" });

      const result = await service.cancelQrOrder("ORD01ABC");
      expect(result).toEqual({ status: "canceled" });
      expect(mpOrdersRepo.updateStatus).toHaveBeenCalledWith("ORD01ABC", "canceled");

      const [url] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toBe("https://api.mercadopago.com/v1/orders/ORD01ABC/cancel");
    });

    it("409 si no está en created", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(makeMpOrder({ status: "processed" }));
      await expect(service.cancelQrOrder("ORD01ABC")).rejects.toBeInstanceOf(Conflict);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
