import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { NightEvent } from "@cocktrail/shared";
import type { MercadoPagoService } from "./mercadopago.service.js";
import type { MpOrder, MpOrdersRepository } from "./mp-orders.repository.js";
import type { ResolvedPosnet } from "./posnet-resolver.service.js";
import { PointPaymentsService } from "./point-payments.service.js";

vi.mock("../../config/env.js", () => ({
  env: { MP_POS_DEVICE_ID: "device-1" },
}));

const EVENT: NightEvent = { id: "event-1", status: "activo", startedAt: Date.now(), orderCounter: 0 };

function makeRow(overrides: Partial<MpOrder> = {}): MpOrder {
  return {
    id: "row-uuid-1",
    orderIdMp: "intent-1",
    externalRef: "cocktrail-1-abc",
    idempotencyKey: "key-1",
    paymentTransactionId: null,
    paymentId: null,
    amount: 1500,
    status: "created",
    type: "point",
    barId: null,
    cajaId: null,
    eventId: "event-1",
    qrData: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    deviceId: "device-1",
    attemptId: "attempt-1111-2222",
    rawState: "OPEN",
    paymentStatus: null,
    paymentStatusDetail: null,
    paidAmount: null,
    verifiedAt: null,
    verificationError: null,
    cartItems: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("PointPaymentsService", () => {
  let mpService: { createPaymentIntent: ReturnType<typeof vi.fn>; resolveIntentOutcome: ReturnType<typeof vi.fn> };
  let repo: MpOrdersRepository;
  let row: MpOrder | null;
  let service: PointPaymentsService;
  let emit: ReturnType<typeof vi.fn>;
  let resolvePosnet: Mock<(barId: string | undefined) => Promise<ResolvedPosnet>>;

  beforeEach(() => {
    row = makeRow();
    mpService = {
      createPaymentIntent: vi.fn().mockResolvedValue({
        id: "intent-1",
        state: "OPEN",
        idempotencyKeyUsed: "key-generada",
        externalReferenceUsed: "cocktrail-1-abc",
        deviceIdUsed: "device-1",
      }),
      resolveIntentOutcome: vi.fn(),
    };
    repo = {
      create: vi.fn().mockImplementation(async (input) => makeRow({ ...input, amount: Number(input.amount) } as Partial<MpOrder>)),
      findByMpId: vi.fn().mockImplementation(async () => row),
      findByPaymentId: vi.fn(),
      findByExternalRef: vi.fn(),
      findByIdempotencyKey: vi.fn(),
      findByAttemptId: vi.fn(),
      update: vi.fn().mockImplementation(async (_id, patch) => {
        row = { ...(row as MpOrder), ...patch } as MpOrder;
        return row;
      }),
      updateStatus: vi.fn(),
    } as unknown as MpOrdersRepository;
    emit = vi.fn();
    // gestion-posnets: el device se resuelve server-side (caja → device activo).
    resolvePosnet = vi.fn().mockResolvedValue({ deviceId: "device-1", source: "caja", cajaId: "caja-1" });
    service = new PointPaymentsService(
      mpService as unknown as MercadoPagoService,
      repo,
      async () => EVENT,
      resolvePosnet,
      emit as unknown as import("../../shared/sse/sse-manager.js").EmitFn,
    );
  });

  describe("createIntent", () => {
    it("persiste el intent en mp_orders (type point, monto en PESOS, device y caja RESUELTOS) y devuelve expiresAt", async () => {
      const result = await service.createIntent({
        amount: 1500,
        description: "Fernet",
        barId: "bar-uuid-1",
        attemptId: "attempt-1111-2222",
        items: [{ drinkId: 1, qty: 2 }],
      });

      expect(resolvePosnet).toHaveBeenCalledWith("bar-uuid-1");
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderIdMp: "intent-1",
          type: "point",
          amount: 1500, // pesos, NUNCA centavos
          deviceId: "device-1",
          cajaId: "caja-1", // la caja resuelta server-side, para trazabilidad
          attemptId: "attempt-1111-2222",
          idempotencyKey: "key-generada",
          externalRef: "cocktrail-1-abc",
          eventId: "event-1",
          cartItems: [{ drinkId: 1, qty: 2 }],
          status: "created",
        }),
      );
      expect(result.expiresAt).toBeTruthy();
      expect(result.id).toBe("intent-1");
    });

    it("crea el intent en MP contra el device RESUELTO (nunca uno del cliente)", async () => {
      await service.createIntent({ amount: 1500, barId: "bar-uuid-1" });

      expect(mpService.createPaymentIntent).toHaveBeenCalledWith(
        1500,
        undefined,
        "device-1",
        expect.any(String),
      );
    });

    it("resolución por env (instalación legacy): persiste cajaId null", async () => {
      resolvePosnet.mockResolvedValue({ deviceId: "env-device", source: "env", cajaId: null });
      mpService.createPaymentIntent.mockResolvedValue({
        id: "intent-1",
        state: "OPEN",
        idempotencyKeyUsed: "key-generada",
        externalReferenceUsed: "cocktrail-1-abc",
        deviceIdUsed: "env-device",
      });

      await service.createIntent({ amount: 1500 });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: "env-device", cajaId: null }),
      );
    });

    it("si el resolver da 409 (caja sin Posnet), propaga SIN llamar a MP", async () => {
      resolvePosnet.mockRejectedValue(
        Object.assign(new Error("Esta caja no tiene Posnet vinculado."), { name: "Conflict" }),
      );

      await expect(service.createIntent({ amount: 1500, barId: "bar-uuid-1" })).rejects.toMatchObject({
        message: expect.stringContaining("no tiene Posnet vinculado"),
      });
      expect(mpService.createPaymentIntent).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("si el INSERT local falla, propaga el error (no devuelve un intent inverificable)", async () => {
      vi.mocked(repo.create).mockRejectedValue(new Error("db caída"));
      await expect(service.createIntent({ amount: 1500 })).rejects.toThrow("db caída");
    });

    it("rechaza amount inválido sin llamar a MP ni al resolver", async () => {
      await expect(service.createIntent({ amount: 0 })).rejects.toMatchObject({ name: "BadRequest" });
      expect(mpService.createPaymentIntent).not.toHaveBeenCalled();
      expect(resolvePosnet).not.toHaveBeenCalled();
    });
  });

  describe("findIntentDeviceId", () => {
    it("devuelve el device de la fila del intent (para cancelar contra el MISMO aparato)", async () => {
      await expect(service.findIntentDeviceId("intent-1")).resolves.toBe("device-1");
    });

    it("devuelve null si el intent no está registrado", async () => {
      row = null;
      await expect(service.findIntentDeviceId("intent-ajeno")).resolves.toBeNull();
    });
  });

  describe("getIntentVerdict — la matriz del veredicto", () => {
    it("approved + monto correcto → FINISHED y persiste processed/paid_amount/verified_at", async () => {
      mpService.resolveIntentOutcome.mockResolvedValue({
        rawState: "FINISHED",
        paymentId: "pay-9",
        paymentStatus: "approved",
        statusDetail: "accredited",
        transactionAmount: 1500,
      });

      const verdict = await service.getIntentVerdict("intent-1");

      expect(verdict.status).toBe("FINISHED");
      expect(verdict.paymentId).toBe("pay-9");
      expect(repo.update).toHaveBeenCalledWith(
        "intent-1",
        expect.objectContaining({
          status: "processed",
          paymentId: "pay-9",
          paidAmount: 1500,
          verifiedAt: expect.any(String),
          verificationError: null,
        }),
      );
    });

    it("approved con monto DISTINTO → UNKNOWN + verification_error, jamás FINISHED", async () => {
      mpService.resolveIntentOutcome.mockResolvedValue({
        rawState: "FINISHED",
        paymentId: "pay-9",
        paymentStatus: "approved",
        transactionAmount: 900,
      });

      const verdict = await service.getIntentVerdict("intent-1");

      expect(verdict.status).toBe("UNKNOWN");
      expect(verdict.reason).toContain("distinto del solicitado");
      expect(repo.update).toHaveBeenCalledWith(
        "intent-1",
        expect.objectContaining({ status: "unknown", paidAmount: 900 }),
      );
    });

    it("rejected → REJECTED con statusDetail distinguible de una cancelación", async () => {
      mpService.resolveIntentOutcome.mockResolvedValue({
        rawState: "FINISHED",
        paymentId: "pay-9",
        paymentStatus: "rejected",
        statusDetail: "cc_rejected_insufficient_amount",
      });

      const verdict = await service.getIntentVerdict("intent-1");

      expect(verdict.status).toBe("REJECTED");
      expect(verdict.statusDetail).toBe("cc_rejected_insufficient_amount");
      expect(repo.update).toHaveBeenCalledWith(
        "intent-1",
        expect.objectContaining({ status: "rejected", paymentStatusDetail: "cc_rejected_insufficient_amount" }),
      );
    });

    it("cancelled → CANCELED (no REJECTED)", async () => {
      mpService.resolveIntentOutcome.mockResolvedValue({
        rawState: "CANCELED",
        paymentId: "pay-9",
        paymentStatus: "cancelled",
      });

      const verdict = await service.getIntentVerdict("intent-1");

      expect(verdict.status).toBe("CANCELED");
    });

    it("FINISHED sin payment.id → UNKNOWN (el caso que originó R27)", async () => {
      mpService.resolveIntentOutcome.mockResolvedValue({ rawState: "FINISHED" });

      const verdict = await service.getIntentVerdict("intent-1");

      expect(verdict.status).toBe("UNKNOWN");
      expect(verdict.reason).toContain("sin payment.id");
    });

    it("deadline server-side vencido sin confirmación → EXPIRED", async () => {
      row = makeRow({ expiresAt: new Date(Date.now() - 1000).toISOString() });
      mpService.resolveIntentOutcome.mockResolvedValue({ rawState: "ON_TERMINAL" });

      const verdict = await service.getIntentVerdict("intent-1");

      expect(verdict.status).toBe("EXPIRED");
      expect(repo.update).toHaveBeenCalledWith("intent-1", expect.objectContaining({ status: "expired" }));
    });

    it("state desconocido → UNKNOWN con raw_state persistido", async () => {
      mpService.resolveIntentOutcome.mockResolvedValue({ rawState: "ESTADO_RARO" });

      const verdict = await service.getIntentVerdict("intent-1");

      expect(verdict.status).toBe("UNKNOWN");
      expect(repo.update).toHaveBeenCalledWith(
        "intent-1",
        expect.objectContaining({ status: "unknown", rawState: "ESTADO_RARO" }),
      );
    });

    it("error consultando MP → UNKNOWN con el motivo, nunca throw ni FINISHED", async () => {
      mpService.resolveIntentOutcome.mockRejectedValue(new Error("MP timeout"));

      const verdict = await service.getIntentVerdict("intent-1");

      expect(verdict.status).toBe("UNKNOWN");
      expect(verdict.reason).toContain("MP timeout");
    });

    it("estado terminal persistido (rejected) corta sin llamar a MP", async () => {
      row = makeRow({ status: "rejected", paymentStatusDetail: "cc_rejected_other_reason" });

      const verdict = await service.getIntentVerdict("intent-1");

      expect(verdict.status).toBe("REJECTED");
      expect(mpService.resolveIntentOutcome).not.toHaveBeenCalled();
    });

    it("expired persistido corta el polling sin llamar a MP", async () => {
      row = makeRow({ status: "expired" });

      const verdict = await service.getIntentVerdict("intent-1");

      expect(verdict.status).toBe("EXPIRED");
      expect(mpService.resolveIntentOutcome).not.toHaveBeenCalled();
    });

    it("intent no registrado → NotFound (anti-forgery: no llama a MP)", async () => {
      row = null;

      await expect(service.getIntentVerdict("intent-ajeno")).rejects.toMatchObject({ name: "NotFound" });
      expect(mpService.resolveIntentOutcome).not.toHaveBeenCalled();
    });

    it("en curso (ON_TERMINAL) dentro del deadline → PENDING con rawState", async () => {
      mpService.resolveIntentOutcome.mockResolvedValue({ rawState: "ON_TERMINAL" });

      const verdict = await service.getIntentVerdict("intent-1");

      expect(verdict.status).toBe("PENDING");
      expect(verdict.rawState).toBe("ON_TERMINAL");
    });
  });

  describe("resolveIntent (recuperación)", () => {
    it("re-consulta MP incluso si la fila quedó expired — si la plata entró, la confirma", async () => {
      row = makeRow({ status: "expired" });
      mpService.resolveIntentOutcome.mockResolvedValue({
        rawState: "FINISHED",
        paymentId: "pay-9",
        paymentStatus: "approved",
        transactionAmount: 1500,
      });

      const verdict = await service.resolveIntent("intent-1");

      expect(verdict.status).toBe("FINISHED");
      expect(mpService.resolveIntentOutcome).toHaveBeenCalledTimes(1);
    });

    it("processed persistido corta sin re-consultar", async () => {
      row = makeRow({ status: "processed", paidAmount: 1500, paymentId: "pay-9" });

      const verdict = await service.resolveIntent("intent-1");

      expect(verdict.status).toBe("FINISHED");
      expect(mpService.resolveIntentOutcome).not.toHaveBeenCalled();
    });
  });

  describe("recoverUnregisteredIntent", () => {
    it("con pago approved crea la fila processed recuperada", async () => {
      mpService.resolveIntentOutcome.mockResolvedValue({
        rawState: "FINISHED",
        paymentId: "pay-9",
        paymentStatus: "approved",
        transactionAmount: 1500,
        externalReference: "cocktrail-1-abc",
      });

      const recovered = await service.recoverUnregisteredIntent("intent-perdido");

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderIdMp: "intent-perdido",
          status: "processed",
          paymentId: "pay-9",
          paidAmount: 1500,
          type: "point",
        }),
      );
      expect(recovered).not.toBeNull();
    });

    it("sin pago approved devuelve null y NO crea fila", async () => {
      mpService.resolveIntentOutcome.mockResolvedValue({ rawState: "FINISHED" });

      const recovered = await service.recoverUnregisteredIntent("intent-perdido");

      expect(recovered).toBeNull();
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  it("emite mp.order.updated (type point) en transiciones terminales", async () => {
    mpService.resolveIntentOutcome.mockResolvedValue({
      rawState: "FINISHED",
      paymentId: "pay-9",
      paymentStatus: "rejected",
      statusDetail: "cc_rejected_insufficient_amount",
    });

    await service.getIntentVerdict("intent-1");

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "mp.order.updated",
        mpOrder: expect.objectContaining({ type: "point", status: "rejected" }),
      }),
    );
  });
});
