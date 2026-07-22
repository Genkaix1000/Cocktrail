import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMercadoPagoPaymentAdapter } from "./mercadopago-payment-adapter.js";
import type { MercadoPagoOrdersService } from "./mercadopago-orders.service.js";
import type { MpOrder, MpOrdersRepository } from "./mp-orders.repository.js";
import type { PointPaymentsService } from "./point-payments.service.js";
import type { VerifyPaymentFn } from "../orders/payment-verification.port.js";

function makeRow(overrides: Partial<MpOrder> = {}): MpOrder {
  return {
    id: "row-uuid-1",
    orderIdMp: "intent-1",
    externalRef: "cocktrail-1-abc",
    idempotencyKey: "key-1",
    paymentTransactionId: null,
    paymentId: "pay-9",
    amount: 1500,
    status: "processed",
    type: "point",
    barId: null,
    cajaId: null,
    eventId: "event-1",
    qrData: null,
    expiresAt: null,
    deviceId: "device-1",
    attemptId: null,
    rawState: "FINISHED",
    paymentStatus: "approved",
    paymentStatusDetail: "accredited",
    paidAmount: 1500,
    verifiedAt: new Date().toISOString(),
    verificationError: null,
    cartItems: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const PROOF = { provider: "mercadopago", kind: "point_intent", id: "intent-1" } as const;

describe("createMercadoPagoPaymentAdapter", () => {
  let mpOrdersRepo: { findByMpId: ReturnType<typeof vi.fn> };
  let pointPayments: {
    resolveIntent: ReturnType<typeof vi.fn>;
    recoverUnregisteredIntent: ReturnType<typeof vi.fn>;
  };
  let qrOrders: { getOrderStatus: ReturnType<typeof vi.fn> };
  let verify: VerifyPaymentFn;

  beforeEach(() => {
    mpOrdersRepo = { findByMpId: vi.fn() };
    pointPayments = { resolveIntent: vi.fn(), recoverUnregisteredIntent: vi.fn() };
    qrOrders = { getOrderStatus: vi.fn() };
    verify = createMercadoPagoPaymentAdapter({
      mpOrdersRepo: mpOrdersRepo as unknown as MpOrdersRepository,
      pointPayments: pointPayments as unknown as PointPaymentsService,
      qrOrders: qrOrders as unknown as MercadoPagoOrdersService,
    });
  });

  it("efectivo → no_aplica sin tocar la red ni la DB", async () => {
    const verdict = await verify({ expectedAmount: 1500, method: "efectivo" });

    expect(verdict).toEqual({ result: "no_aplica" });
    expect(mpOrdersRepo.findByMpId).not.toHaveBeenCalled();
  });

  it("sin proof (no efectivo) → indeterminado", async () => {
    const verdict = await verify({ expectedAmount: 1500, method: "debito" });
    expect(verdict.result).toBe("indeterminado");
  });

  it("fila processed con montos correctos → confirmado con proofRecordId y paymentId", async () => {
    mpOrdersRepo.findByMpId.mockResolvedValue(makeRow());

    const verdict = await verify({ proof: PROOF, expectedAmount: 1500, method: "debito" });

    expect(verdict).toEqual({
      result: "confirmado",
      providerPaymentId: "pay-9",
      amount: 1500,
      proofRecordId: "row-uuid-1",
    });
    // Fila ya asentada: cero llamadas vivas a MP.
    expect(pointPayments.resolveIntent).not.toHaveBeenCalled();
  });

  it("fila processed pero monto distinto al esperado → indeterminado, nunca confirmado", async () => {
    mpOrdersRepo.findByMpId.mockResolvedValue(makeRow({ amount: 900, paidAmount: 900 }));

    const verdict = await verify({ proof: PROOF, expectedAmount: 1500, method: "debito" });

    expect(verdict.result).toBe("indeterminado");
  });

  it("fila rejected → rechazado con el detail de MP", async () => {
    mpOrdersRepo.findByMpId.mockResolvedValue(
      makeRow({ status: "rejected", paymentStatusDetail: "cc_rejected_insufficient_amount" }),
    );

    const verdict = await verify({ proof: PROOF, expectedAmount: 1500, method: "debito" });

    expect(verdict).toMatchObject({ result: "rechazado", detail: "cc_rejected_insufficient_amount" });
  });

  it("fila canceled → rechazado (el registro no puede usar un cobro cancelado)", async () => {
    mpOrdersRepo.findByMpId.mockResolvedValue(makeRow({ status: "canceled" }));

    const verdict = await verify({ proof: PROOF, expectedAmount: 1500, method: "debito" });

    expect(verdict.result).toBe("rechazado");
  });

  it("el tipo de la fila no coincide con el kind del proof → indeterminado sin re-consulta", async () => {
    mpOrdersRepo.findByMpId.mockResolvedValue(makeRow({ type: "qr" }));

    const verdict = await verify({ proof: PROOF, expectedAmount: 1500, method: "debito" });

    expect(verdict.result).toBe("indeterminado");
    expect(pointPayments.resolveIntent).not.toHaveBeenCalled();
  });

  it("fila inconclusa (created) → UNA re-consulta viva y usa el resultado persistido", async () => {
    mpOrdersRepo.findByMpId
      .mockResolvedValueOnce(makeRow({ status: "created", paidAmount: null, paymentId: null }))
      .mockResolvedValueOnce(makeRow()); // tras el resolve, quedó processed
    pointPayments.resolveIntent.mockResolvedValue({ status: "FINISHED" });

    const verdict = await verify({ proof: PROOF, expectedAmount: 1500, method: "debito" });

    expect(pointPayments.resolveIntent).toHaveBeenCalledWith("intent-1");
    expect(verdict.result).toBe("confirmado");
  });

  it("fila ausente → re-consulta viva (recovery); si MP confirma, confirmado", async () => {
    mpOrdersRepo.findByMpId.mockResolvedValue(null);
    pointPayments.recoverUnregisteredIntent.mockResolvedValue(makeRow());

    const verdict = await verify({ proof: PROOF, expectedAmount: 1500, method: "debito" });

    expect(pointPayments.recoverUnregisteredIntent).toHaveBeenCalledWith("intent-1");
    expect(verdict.result).toBe("confirmado");
  });

  it("fila ausente y MP no confirma → indeterminado", async () => {
    mpOrdersRepo.findByMpId.mockResolvedValue(null);
    pointPayments.recoverUnregisteredIntent.mockResolvedValue(null);

    const verdict = await verify({ proof: PROOF, expectedAmount: 1500, method: "debito" });

    expect(verdict.result).toBe("indeterminado");
  });

  it("la re-consulta viva falla → indeterminado, nunca confirmado (D1)", async () => {
    mpOrdersRepo.findByMpId.mockResolvedValue(makeRow({ status: "created", paidAmount: null }));
    pointPayments.resolveIntent.mockRejectedValue(new Error("MP caído"));

    const verdict = await verify({ proof: PROOF, expectedAmount: 1500, method: "debito" });

    expect(verdict.result).toBe("indeterminado");
    expect((verdict as { reason: string }).reason).toContain("MP caído");
  });

  it("kind qr_order inconcluso → re-consulta via MercadoPagoOrdersService", async () => {
    const qrProof = { provider: "mercadopago", kind: "qr_order", id: "ORD01ABC" } as const;
    mpOrdersRepo.findByMpId.mockResolvedValue(
      makeRow({ orderIdMp: "ORD01ABC", type: "qr", status: "created", paidAmount: null, paymentId: null }),
    );
    qrOrders.getOrderStatus.mockResolvedValue(makeRow({ orderIdMp: "ORD01ABC", type: "qr" }));

    const verdict = await verify({ proof: qrProof, expectedAmount: 1500, method: "qr" });

    expect(qrOrders.getOrderStatus).toHaveBeenCalledWith("ORD01ABC");
    expect(verdict.result).toBe("confirmado");
  });

  it("kind qr_order con fila ausente → indeterminado sin recovery (el QR siempre persiste al crear)", async () => {
    const qrProof = { provider: "mercadopago", kind: "qr_order", id: "ORD-AJENA" } as const;
    mpOrdersRepo.findByMpId.mockResolvedValue(null);

    const verdict = await verify({ proof: qrProof, expectedAmount: 1500, method: "qr" });

    expect(verdict.result).toBe("indeterminado");
    expect(qrOrders.getOrderStatus).not.toHaveBeenCalled();
    expect(pointPayments.recoverUnregisteredIntent).not.toHaveBeenCalled();
  });
});
