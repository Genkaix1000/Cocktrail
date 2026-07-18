import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { buildWebhookManifest } from "./mercadopago-webhook-signature.js";
import { Unauthorized } from "../../shared/errors/http-errors.js";
import type { EmitFn } from "../../shared/sse/sse-manager.js";
import type { MpOrder } from "./mp-orders.repository.js";

const SECRET = "webhook-test-secret";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { MP_WEBHOOK_SECRET: "webhook-test-secret" as string | undefined },
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
    createdAt: "2026-07-17T00:00:00Z",
    updatedAt: "2026-07-17T00:00:00Z",
    ...overrides,
  };
}

function signWebhook(dataId: string, xRequestId: string, ts: string): string {
  const manifest = buildWebhookManifest(dataId, xRequestId, ts);
  const v1 = createHmac("sha256", SECRET).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("MercadoPagoWebhooksService", () => {
  let mpOrdersService: MercadoPagoOrdersService;
  let emit: EmitFn;
  let service: MercadoPagoWebhooksService;

  beforeEach(() => {
    mockEnv.MP_WEBHOOK_SECRET = SECRET;

    mpOrdersService = {
      reconcileFromMp: vi.fn(),
    } as unknown as MercadoPagoOrdersService;

    emit = vi.fn();
    service = new MercadoPagoWebhooksService(mpOrdersService, emit);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza webhooks sin firma válida", () => {
    expect(() =>
      service.handleWebhook({
        dataId: "ORD01ABC",
        type: "order",
        xSignature: "ts=1,v1=bad",
        xRequestId: "req-1",
        body: { action: "order.processed", type: "order" },
      }),
    ).toThrow(Unauthorized);
  });

  it("rechaza si MP_WEBHOOK_SECRET no está configurado", () => {
    mockEnv.MP_WEBHOOK_SECRET = undefined;
    expect(() =>
      service.handleWebhook({
        dataId: "ORD01ABC",
        type: "order",
        xSignature: signWebhook("ORD01ABC", "req-1", "1700000000000"),
        xRequestId: "req-1",
        body: {},
      }),
    ).toThrow(Unauthorized);
  });

  it("ignora eventos que no son type=order", async () => {
    const dataId = "PAY123";
    const xRequestId = "req-legacy";
    const ts = "1700000000000";

    service.handleWebhook({
      dataId,
      type: "payment",
      xSignature: signWebhook(dataId, xRequestId, ts),
      xRequestId,
      body: { type: "payment", action: "payment.created" },
    });

    await new Promise((r) => setImmediate(r));
    expect(mpOrdersService.reconcileFromMp).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("encola reconciliación async para eventos order válidos", async () => {
    vi.mocked(mpOrdersService.reconcileFromMp).mockResolvedValue({
      mpOrder: makeMpOrder(),
      mpType: "qr",
      statusDetail: "accredited",
    });

    const dataId = "ORD01ABC";
    const xRequestId = "req-order";
    const ts = "1700000000000";

    service.handleWebhook({
      dataId,
      type: "order",
      xSignature: signWebhook(dataId, xRequestId, ts),
      xRequestId,
      body: { action: "order.processed", type: "order", live_mode: false },
    });

    await new Promise((r) => setImmediate(r));

    expect(mpOrdersService.reconcileFromMp).toHaveBeenCalledWith("ORD01ABC");
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

  it("marca isPartialRefund cuando status_detail es partially_refunded", async () => {
    vi.mocked(mpOrdersService.reconcileFromMp).mockResolvedValue({
      mpOrder: makeMpOrder({ status: "processed" }),
      mpType: "qr",
      statusDetail: "partially_refunded",
    });

    const dataId = "ORD01ABC";
    const xRequestId = "req-partial";
    const ts = "1700000000001";

    service.handleWebhook({
      dataId,
      type: "order",
      xSignature: signWebhook(dataId, xRequestId, ts),
      xRequestId,
      body: { action: "order.processed", type: "order" },
    });

    await new Promise((r) => setImmediate(r));

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "mp.order.updated",
        isPartialRefund: true,
      }),
    );
  });

  it("no emite SSE si la order no existe localmente", async () => {
    vi.mocked(mpOrdersService.reconcileFromMp).mockResolvedValue(null);

    const dataId = "ORD-UNKNOWN";
    const xRequestId = "req-missing";
    const ts = "1700000000002";

    service.handleWebhook({
      dataId,
      type: "order",
      xSignature: signWebhook(dataId, xRequestId, ts),
      xRequestId,
      body: { action: "order.processed", type: "order" },
    });

    await new Promise((r) => setImmediate(r));
    expect(emit).not.toHaveBeenCalled();
  });
});
