import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { buildWebhookManifest } from "./mercadopago-webhook-signature.js";
import { Unauthorized } from "../../shared/errors/http-errors.js";
import type { EmitFn } from "../../shared/sse/sse-manager.js";
import type { MpOrder } from "./mp-orders.repository.js";
import type {
  MpWebhookEvent,
  MpWebhookEventsRepository,
} from "./mp-webhook-events.repository.js";

const SECRET = "webhook-test-secret";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    MP_WEBHOOK_SECRET: "webhook-test-secret" as string | undefined,
    MP_WEBHOOK_TS_TOLERANCE_SECONDS: 300,
  },
}));

vi.mock("../../config/env.js", () => ({ env: mockEnv }));

import { MercadoPagoWebhooksService } from "./mercadopago-webhooks.service.js";
import type { MercadoPagoOrdersService } from "./mercadopago-orders.service.js";

function makeMpOrder(overrides: Partial<MpOrder> = {}): MpOrder {
  return {
    id: "local-1",
    orderIdMp: "ORD01ABC",
    externalRef: "COCKTRAIL-xyz",
    idempotencyKey: "idem-1",
    paymentTransactionId: "PAY01TXN",
    paymentId: "99887766",
    amount: 1500,
    status: "processed",
    type: "qr",
    barId: "bar-1",
    cajaId: "caja-1",
    eventId: "event-1",
    qrData: null,
    expiresAt: null,
    deviceId: null,
    attemptId: null,
    rawState: null,
    paymentStatus: null,
    paymentStatusDetail: null,
    paidAmount: null,
    verifiedAt: null,
    verificationError: null,
    cartItems: null,
    createdAt: "2026-07-17T00:00:00Z",
    updatedAt: "2026-07-17T00:00:00Z",
    ...overrides,
  };
}

function makeStoredEvent(overrides: Partial<MpWebhookEvent> = {}): MpWebhookEvent {
  return {
    id: "evt-1",
    xRequestId: "req-1",
    dataId: "ORD01ABC",
    type: "order",
    payload: { action: "order.processed", type: "order" },
    receivedAt: new Date().toISOString(),
    processedAt: null,
    attempts: 0,
    lastError: null,
    ...overrides,
  };
}

function signWebhook(dataId: string, xRequestId: string, ts: string): string {
  const manifest = buildWebhookManifest(dataId, xRequestId, ts);
  const v1 = createHmac("sha256", SECRET).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

/** ts fresco en ms — las firmas con ts viejo ahora se rechazan por frescura. */
function freshTs(): string {
  return Date.now().toString();
}

/** Drena el setImmediate + la cadena async de processStoredEvent/replayPending. */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setImmediate(r));
  }
}

describe("MercadoPagoWebhooksService", () => {
  let mpOrdersService: MercadoPagoOrdersService;
  let webhookEventsRepo: MpWebhookEventsRepository;
  let emit: EmitFn;
  let service: MercadoPagoWebhooksService;

  beforeEach(() => {
    mockEnv.MP_WEBHOOK_SECRET = SECRET;

    mpOrdersService = {
      reconcileFromMp: vi.fn(),
    } as unknown as MercadoPagoOrdersService;

    webhookEventsRepo = {
      insert: vi.fn().mockImplementation(async (input) => ({
        duplicate: false,
        event: makeStoredEvent({
          xRequestId: input.xRequestId,
          dataId: input.dataId ?? null,
          type: input.type ?? null,
          payload: input.payload,
        }),
      })),
      markProcessed: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
      findPending: vi.fn().mockResolvedValue([]),
    };

    emit = vi.fn();
    service = new MercadoPagoWebhooksService(mpOrdersService, webhookEventsRepo, emit);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza webhooks sin firma válida", async () => {
    await expect(
      service.handleWebhook({
        dataId: "ORD01ABC",
        type: "order",
        xSignature: `ts=${freshTs()},v1=bad`,
        xRequestId: "req-1",
        body: { action: "order.processed", type: "order" },
      }),
    ).rejects.toBeInstanceOf(Unauthorized);
    expect(webhookEventsRepo.insert).not.toHaveBeenCalled();
  });

  it("rechaza si MP_WEBHOOK_SECRET no está configurado", async () => {
    mockEnv.MP_WEBHOOK_SECRET = undefined;
    const ts = freshTs();
    await expect(
      service.handleWebhook({
        dataId: "ORD01ABC",
        type: "order",
        xSignature: signWebhook("ORD01ABC", "req-1", ts),
        xRequestId: "req-1",
        body: {},
      }),
    ).rejects.toBeInstanceOf(Unauthorized);
  });

  it("rechaza una firma correcta pero con ts viejo (anti-replay)", async () => {
    const oldTs = (Date.now() - 10 * 60 * 1000).toString();
    await expect(
      service.handleWebhook({
        dataId: "ORD01ABC",
        type: "order",
        xSignature: signWebhook("ORD01ABC", "req-replay", oldTs),
        xRequestId: "req-replay",
        body: { action: "order.processed", type: "order" },
      }),
    ).rejects.toBeInstanceOf(Unauthorized);
    expect(webhookEventsRepo.insert).not.toHaveBeenCalled();
  });

  it("ignora eventos que no son type=order (no los persiste)", async () => {
    const dataId = "PAY123";
    const xRequestId = "req-legacy";
    const ts = freshTs();

    await service.handleWebhook({
      dataId,
      type: "payment",
      xSignature: signWebhook(dataId, xRequestId, ts),
      xRequestId,
      body: { type: "payment", action: "payment.created" },
    });

    await flushAsync();
    expect(webhookEventsRepo.insert).not.toHaveBeenCalled();
    expect(mpOrdersService.reconcileFromMp).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("persiste el evento ANTES de resolver (durabilidad) y reconcilia async", async () => {
    vi.mocked(mpOrdersService.reconcileFromMp).mockResolvedValue({
      mpOrder: makeMpOrder(),
      mpType: "qr",
      statusDetail: "accredited",
    });

    const dataId = "ORD01ABC";
    const xRequestId = "req-order";
    const ts = freshTs();

    await service.handleWebhook({
      dataId,
      type: "order",
      xSignature: signWebhook(dataId, xRequestId, ts),
      xRequestId,
      body: { action: "order.processed", type: "order", live_mode: false },
    });

    // El insert ya ocurrió al resolver handleWebhook (antes del 200 del controller).
    expect(webhookEventsRepo.insert).toHaveBeenCalledWith({
      xRequestId: "req-order",
      dataId: "ORD01ABC",
      type: "order",
      payload: { action: "order.processed", type: "order", live_mode: false },
    });

    await flushAsync();

    expect(mpOrdersService.reconcileFromMp).toHaveBeenCalledWith("ORD01ABC");
    expect(webhookEventsRepo.markProcessed).toHaveBeenCalledWith("evt-1");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "mp.order.updated",
        mpOrder: expect.objectContaining({
          orderIdMp: "ORD01ABC",
          status: "processed",
          paymentId: "99887766",
        }),
        action: "order.processed",
      }),
    );
  });

  it("x-request-id duplicado: resuelve OK (200) sin reprocesar", async () => {
    vi.mocked(webhookEventsRepo.insert).mockResolvedValue({ duplicate: true });

    const dataId = "ORD01ABC";
    const xRequestId = "req-dup";
    const ts = freshTs();

    await service.handleWebhook({
      dataId,
      type: "order",
      xSignature: signWebhook(dataId, xRequestId, ts),
      xRequestId,
      body: { action: "order.processed", type: "order" },
    });

    await flushAsync();
    expect(mpOrdersService.reconcileFromMp).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("si el INSERT falla (DB caída), handleWebhook rechaza → el controller devuelve 500 y MP reintenta", async () => {
    vi.mocked(webhookEventsRepo.insert).mockRejectedValue(new Error("db down"));

    const dataId = "ORD01ABC";
    const xRequestId = "req-db-down";
    const ts = freshTs();

    await expect(
      service.handleWebhook({
        dataId,
        type: "order",
        xSignature: signWebhook(dataId, xRequestId, ts),
        xRequestId,
        body: { action: "order.processed", type: "order" },
      }),
    ).rejects.toThrow("db down");
    expect(mpOrdersService.reconcileFromMp).not.toHaveBeenCalled();
  });

  it("si el reconcile falla, registra attempts/last_error (markFailed) y NO marca processed", async () => {
    vi.mocked(mpOrdersService.reconcileFromMp).mockRejectedValue(
      new Error("MP no responde"),
    );

    const dataId = "ORD01ABC";
    const xRequestId = "req-fail";
    const ts = freshTs();

    await service.handleWebhook({
      dataId,
      type: "order",
      xSignature: signWebhook(dataId, xRequestId, ts),
      xRequestId,
      body: { action: "order.processed", type: "order" },
    });

    await flushAsync();

    expect(webhookEventsRepo.markFailed).toHaveBeenCalledWith("evt-1", "MP no responde");
    expect(webhookEventsRepo.markProcessed).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("marca isPartialRefund cuando status_detail es partially_refunded", async () => {
    vi.mocked(mpOrdersService.reconcileFromMp).mockResolvedValue({
      mpOrder: makeMpOrder({ status: "processed" }),
      mpType: "qr",
      statusDetail: "partially_refunded",
    });

    const dataId = "ORD01ABC";
    const xRequestId = "req-partial";
    const ts = freshTs();

    await service.handleWebhook({
      dataId,
      type: "order",
      xSignature: signWebhook(dataId, xRequestId, ts),
      xRequestId,
      body: { action: "order.processed", type: "order" },
    });

    await flushAsync();

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "mp.order.updated",
        isPartialRefund: true,
      }),
    );
  });

  it("order desconocida localmente: no emite SSE pero marca el evento como procesado", async () => {
    vi.mocked(mpOrdersService.reconcileFromMp).mockResolvedValue(null);

    const dataId = "ORD-UNKNOWN";
    const xRequestId = "req-missing";
    const ts = freshTs();

    await service.handleWebhook({
      dataId,
      type: "order",
      xSignature: signWebhook(dataId, xRequestId, ts),
      xRequestId,
      body: { action: "order.processed", type: "order" },
    });

    await flushAsync();
    expect(emit).not.toHaveBeenCalled();
    expect(webhookEventsRepo.markProcessed).toHaveBeenCalledWith("evt-1");
  });

  describe("replayPending", () => {
    it("reprocesa los eventos pendientes en serie y los marca", async () => {
      const eventA = makeStoredEvent({ id: "evt-a", dataId: "ORD-A" });
      const eventB = makeStoredEvent({ id: "evt-b", dataId: "ORD-B" });
      vi.mocked(webhookEventsRepo.findPending).mockResolvedValue([eventA, eventB]);
      vi.mocked(mpOrdersService.reconcileFromMp).mockResolvedValue({
        mpOrder: makeMpOrder(),
        mpType: "qr",
        statusDetail: "accredited",
      });

      await service.replayPending();

      expect(mpOrdersService.reconcileFromMp).toHaveBeenNthCalledWith(1, "ORD-A");
      expect(mpOrdersService.reconcileFromMp).toHaveBeenNthCalledWith(2, "ORD-B");
      expect(webhookEventsRepo.markProcessed).toHaveBeenCalledWith("evt-a");
      expect(webhookEventsRepo.markProcessed).toHaveBeenCalledWith("evt-b");
    });

    it("un evento que falla no corta el replay del resto", async () => {
      const eventA = makeStoredEvent({ id: "evt-a", dataId: "ORD-A" });
      const eventB = makeStoredEvent({ id: "evt-b", dataId: "ORD-B" });
      vi.mocked(webhookEventsRepo.findPending).mockResolvedValue([eventA, eventB]);
      vi.mocked(mpOrdersService.reconcileFromMp)
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce({
          mpOrder: makeMpOrder(),
          mpType: "qr",
          statusDetail: "accredited",
        });

      await service.replayPending();

      expect(webhookEventsRepo.markFailed).toHaveBeenCalledWith("evt-a", "boom");
      expect(webhookEventsRepo.markProcessed).toHaveBeenCalledWith("evt-b");
    });

    it("sin pendientes: no toca nada", async () => {
      await service.replayPending();
      expect(mpOrdersService.reconcileFromMp).not.toHaveBeenCalled();
    });
  });
});
