import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MercadoPagoOrdersService } from "./mercadopago-orders.service.js";
import type { BarsRepository, Bar } from "./bars.repository.js";
import type { MercadoPagoCajasRepository, Caja } from "./mercadopago-cajas.repository.js";
import type { MpOrder, MpOrdersRepository } from "./mp-orders.repository.js";
import type { CredentialsResolverService } from "./credentials-resolver.service.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";

function makeBar(overrides: Partial<Bar> = {}): Bar {
  return {
    id: "bar-uuid-1",
    name: "Barra VIP",
    code: "BARRA-01",
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
  let service: MercadoPagoOrdersService;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());

    barsRepo = {
      findByCode: vi.fn().mockResolvedValue(makeBar()),
      findById: vi.fn().mockResolvedValue(makeBar()),
      listAll: vi.fn().mockResolvedValue([makeBar()]),
      findOrCreateByCode: vi.fn().mockResolvedValue(makeBar()),
    };

    cajasRepo = {
      findById: vi.fn(),
      findByBarId: vi.fn().mockResolvedValue(makeCaja()),
      findBySellerUserId: vi.fn(),
      listAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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
        }),
      ),
      findByMpId: vi.fn(),
      findByPaymentId: vi.fn(),
      findByExternalRef: vi.fn(),
      update: vi.fn().mockImplementation(async (orderIdMp, patch) =>
        makeMpOrder({ orderIdMp, ...patch }),
      ),
      updateStatus: vi.fn().mockImplementation(async (orderIdMp, status) =>
        makeMpOrder({ orderIdMp, status }),
      ),
    };

    credentialsResolver = {
      resolve: vi.fn().mockResolvedValue("AT-test"),
    } as unknown as CredentialsResolverService;

    service = new MercadoPagoOrdersService(
      credentialsResolver,
      barsRepo,
      cajasRepo,
      mpOrdersRepo,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("createQrOrder", () => {
    it("crea la order en MP y la persiste localmente", async () => {
      mockFetchOk({
        id: "ORD01NEW",
        status: "created",
        transactions: { payments: [{ id: "PAY01TXN", amount: "1500.00" }] },
      });

      const result = await service.createQrOrder({
        amount: 1500,
        barId: "BARRA-01",
        description: "Mesa 3",
      });

      expect(result).toMatchObject({
        orderId: "ORD01NEW",
        qrImage: "https://mp.example/qr.png",
        status: "created",
      });
      expect(result.expiresAt).toBeTruthy();

      expect(credentialsResolver.resolve).toHaveBeenCalledWith({
        barId: "bar-uuid-1",
        allowGlobalFallback: true,
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
        }),
      );

      const [url, init] = vi.mocked(fetch).mock.calls[0]!;
      expect(url).toBe("https://api.mercadopago.com/v1/orders");
      const body = JSON.parse(String((init as RequestInit).body));
      expect(body).toMatchObject({
        type: "qr",
        total_amount: "1500.00",
        config: { qr: { external_pos_id: "COCKTRAILBAR01", mode: "static" } },
      });
      expect(body.external_reference).toMatch(/^COCKTRAIL-/);
      expect(body.external_reference.length).toBeLessThanOrEqual(64);
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
  });

  describe("getOrderStatus", () => {
    it("devuelve directo si el estado local ya es final", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(
        makeMpOrder({ status: "processed", paymentId: "12345" }),
      );

      const result = await service.getOrderStatus("ORD01ABC");
      expect(result.status).toBe("processed");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("consulta MP y actualiza status + payment_id (reference_id)", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(makeMpOrder());
      mockFetchOk({
        id: "ORD01ABC",
        status: "processed",
        transactions: {
          payments: [{ id: "PAY01TXN", reference_id: "99887766", status: "processed" }],
        },
      });

      const result = await service.getOrderStatus("ORD01ABC");
      expect(mpOrdersRepo.update).toHaveBeenCalledWith("ORD01ABC", {
        status: "processed",
        paymentId: "99887766",
      });
      expect(result.status).toBe("processed");
    });

    it("404 si la order no existe localmente", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(null);
      await expect(service.getOrderStatus("ORD-MISSING")).rejects.toBeInstanceOf(NotFound);
    });
  });

  describe("reconcileFromMp", () => {
    it("consulta MP y actualiza mp_orders (webhook / conciliación)", async () => {
      vi.mocked(mpOrdersRepo.findByMpId).mockResolvedValue(makeMpOrder());
      mockFetchOk({
        id: "ORD01ABC",
        status: "processed",
        type: "qr",
        status_detail: "accredited",
        transactions: {
          payments: [{ id: "PAY01TXN", reference_id: "99887766" }],
        },
      });

      const result = await service.reconcileFromMp("ORD01ABC");
      expect(result).toMatchObject({
        mpType: "qr",
        statusDetail: "accredited",
        mpOrder: expect.objectContaining({ status: "processed" }),
      });
      expect(mpOrdersRepo.update).toHaveBeenCalledWith("ORD01ABC", {
        status: "processed",
        paymentId: "99887766",
      });
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
