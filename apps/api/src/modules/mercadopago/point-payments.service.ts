import { randomUUID } from "node:crypto";
import type { NightEvent } from "@cocktrail/shared";
import { env } from "../../config/env.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";
import type { EmitFn } from "../../shared/sse/sse-manager.js";
import type { MercadoPagoService, MpPaymentIntentResponse, CreatedIntentMeta, IntentOutcome } from "./mercadopago.service.js";
import type { MpCartItem, MpFeeStatus, MpOrder, MpOrdersRepository, MpOrderStatus } from "./mp-orders.repository.js";
import { parsePaymentFees } from "./mp-payment-fees.js";
import type { ResolvedPosnet } from "./posnet-resolver.service.js";

/**
 * Deadline server-side del cobro con Posnet: pasado esto sin confirmación, el
 * intent queda "expired" y el polling corta — la autoridad es del server, no
 * del navegador. 10 minutos: holgado para reintentos de tarjeta en el device,
 * corto para que un intent abandonado no quede vivo toda la noche.
 */
export const POINT_INTENT_TTL_MS = 10 * 60 * 1000;

/**
 * Estados normalizados que consume el frontend en GET /pos/intent/:id.
 * REJECTED ≠ CANCELED a propósito (criterio E): tarjeta sin fondos no es
 * "cancelado por la cajera".
 */
export type PointVerdictStatus =
  | "PENDING" // sin resultado todavía (rawState da el detalle: OPEN/ON_TERMINAL/…)
  | "FINISHED" // cobro confirmado contra /v1/payments (approved + monto correcto)
  | "REJECTED" // el pago fue rechazado (statusDetail trae el motivo de MP)
  | "CANCELED" // cancelado (cajera o device)
  | "EXPIRED" // venció el deadline server-side sin confirmación
  | "UNKNOWN"; // no se pudo confirmar (nunca se trata como cobrado — D1)

export type PointIntentVerdict = {
  status: PointVerdictStatus;
  rawState?: string;
  reason?: string;
  statusDetail?: string;
  paymentId?: string;
  expiresAt?: string;
};

export type CreatePointIntentInput = {
  /** ⚠ En PESOS. */
  amount: number;
  description?: string;
  /**
   * Barra del contexto (A12). El device NO viene del cliente (anti-spoof A5):
   * se resuelve server-side con `resolvePosnet` (caja → device activo).
   */
  barId?: string;
  /** Semilla estable por intento de cobro (la genera el frontend). */
  attemptId?: string;
  /** Carrito de la venta: sobrevive al cierre de la pestaña (deuda anotada: dato de dominio en tabla de pagos). */
  items?: MpCartItem[];
};

export type CreatePointIntentResult = MpPaymentIntentResponse & CreatedIntentMeta & { expiresAt: string };

/** Nada vuelve atrás desde acá: ni el polling ni /resolve re-consultan MP. */
const HARD_TERMINAL: ReadonlySet<MpOrderStatus> = new Set(["processed", "rejected", "canceled", "refunded"]);

/** Estados del intent documentados como "en curso" — todo lo demás sin pago asociado es sospechoso. */
const IN_PROGRESS_STATES: ReadonlySet<string> = new Set(["OPEN", "ON_TERMINAL", "PROCESSING", "CONFIRMATION_REQUIRED"]);

const STATUS_TO_VERDICT: Record<MpOrderStatus, PointVerdictStatus> = {
  created: "PENDING",
  processed: "FINISHED",
  rejected: "REJECTED",
  canceled: "CANCELED",
  refunded: "CANCELED",
  expired: "EXPIRED",
  failed: "REJECTED",
  action_required: "PENDING",
  unknown: "UNKNOWN",
};

/**
 * Política del cobro con Posnet (Point): crea y PERSISTE el intent, resuelve el
 * veredicto contra el pago real, compara montos, aplica el deadline y persiste
 * el resultado. El gateway (MercadoPagoService) solo informa; acá se decide.
 *
 * Los intents de prueba (testDeviceReachability / POST /device/test-charge) NO
 * pasan por acá a propósito: no se persisten en mp_orders.
 */
export class PointPaymentsService {
  constructor(
    private readonly mpService: MercadoPagoService,
    private readonly mpOrdersRepo: MpOrdersRepository,
    private readonly getActiveEvent: () => Promise<NightEvent | null>,
    // Se inyecta la FUNCIÓN (no el service entero) — mismo criterio que
    // getActiveEvent: esta clase solo necesita resolver, no toda la clase.
    private readonly resolvePosnet: (barId: string | undefined) => Promise<ResolvedPosnet>,
    private readonly emit?: EmitFn,
    private readonly isGhostMode: () => Promise<boolean> = async () => false,
  ) {}

  async createIntent(input: CreatePointIntentInput): Promise<CreatePointIntentResult> {
    if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequest("amount es requerido y debe ser un número positivo.");
    }

    if (await this.isGhostMode()) {
      throw new Conflict(
        "Ghost mode activo: el Posnet no está disponible. Usá QR, efectivo o cortesía.",
        "GHOST_POSNET_DISABLED",
      );
    }

    // El Posnet se resuelve PRIMERO y server-side (caja → device activo, env
    // como último recurso): si la caja no tiene Posnet vinculado, el 409 corta
    // acá, antes de tocar Mercado Pago.
    const resolved = await this.resolvePosnet(input.barId);

    // No exige noche abierta (el registro de la venta sí la exige) — solo la liga si hay.
    const event = await this.getActiveEvent();
    // El intent se persiste en mp_orders ligado a la noche, y una noche de prueba no está
    // en la base: se rechaza antes de tocar Mercado Pago (C1/C3).
    if (event?.isTest) {
      throw new Conflict("Noche de prueba: solo efectivo.", "TEST_NIGHT");
    }

    // La key NO se ata al attemptId del cliente: el retry del 2205 crea un 2º
    // intent legítimo para el mismo attempt y la key es UNIQUE en mp_orders.
    const intent = await this.mpService.createPaymentIntent(
      input.amount,
      input.description,
      resolved.deviceId,
      randomUUID(),
    );
    if (!intent.id) {
      throw new Conflict("Mercado Pago no devolvió un id para la intención de pago.");
    }

    const expiresAt = new Date(Date.now() + POINT_INTENT_TTL_MS).toISOString();
    // Si el INSERT falla se propaga el error: mejor que la cajera reintente (el
    // auto-recovery del 2205 limpia el intent colgado del device) a devolver un
    // intent imposible de verificar después.
    await this.mpOrdersRepo.create({
      orderIdMp: intent.id,
      externalRef: intent.externalReferenceUsed,
      idempotencyKey: intent.idempotencyKeyUsed,
      amount: input.amount,
      status: "created",
      type: "point",
      // Trazabilidad del cobro: device y caja RESUELTOS (no lo que dijo el
      // cliente) — resolveIntentOutcome después opera con este device_id.
      deviceId: intent.deviceIdUsed,
      cajaId: resolved.cajaId,
      attemptId: input.attemptId ?? null,
      eventId: event?.id ?? null,
      cartItems: input.items ?? null,
      expiresAt,
      rawState: intent.state || intent.status || "OPEN",
    });

    return { ...intent, expiresAt };
  }

  /**
   * Veredicto para el polling: los estados duros y "expired" cortan sin tocar
   * MP; el resto se re-consulta y persiste.
   */
  async getIntentVerdict(intentId: string): Promise<PointIntentVerdict> {
    let row = await this.findPointRow(intentId);
    if (needsFeeEnrichment(row)) {
      row = await this.enrichFees(row);
    }
    if (HARD_TERMINAL.has(row.status) || row.status === "expired") {
      return this.toVerdict(row);
    }
    return this.refreshVerdict(row);
  }

  /**
   * Recuperación explícita (POST /pos/intent/:id/resolve): igual que el
   * polling, pero "expired" también se re-consulta — si la plata entró después
   * del deadline, mejor confirmarla acá que perderla.
   */
  async resolveIntent(intentId: string): Promise<PointIntentVerdict> {
    let row = await this.findPointRow(intentId);
    if (needsFeeEnrichment(row)) {
      row = await this.enrichFees(row);
    }
    if (HARD_TERMINAL.has(row.status)) {
      return this.toVerdict(row);
    }
    return this.refreshVerdict(row);
  }

  /**
   * Recuperación de un intent SIN fila local (ej. el proceso murió entre crear
   * en MP y persistir). Solo crea la fila si MP confirma un pago aprobado —
   * cualquier otra cosa devuelve null y el veredicto queda indeterminado.
   */
  async recoverUnregisteredIntent(intentId: string): Promise<MpOrder | null> {
    const outcome = await this.mpService.resolveIntentOutcome(intentId);
    if (
      outcome.paymentStatus !== "approved" ||
      !outcome.paymentId ||
      typeof outcome.transactionAmount !== "number"
    ) {
      return null;
    }
    try {
      return await this.mpOrdersRepo.create({
        orderIdMp: intentId,
        externalRef: (outcome.externalReference ?? `RECOVERED-${intentId}`).slice(0, 64),
        // La key original se perdió con la fila; esta es solo registro.
        idempotencyKey: randomUUID(),
        amount: outcome.transactionAmount,
        status: "processed",
        type: "point",
        // Etiqueta best-effort, NO el device real del cobro (se perdió con la
        // fila). No se resuelve por la caja a propósito: este camino no trae
        // barId y resolvePosnet marcaría el flag de uso de env / warn de un
        // cobro que no está ocurriendo (anotado en gestion-posnets T18).
        deviceId: env.MP_POS_DEVICE_ID || "desconocido",
        paymentId: outcome.paymentId,
        paidAmount: outcome.transactionAmount,
        paymentStatus: outcome.paymentStatus,
        paymentStatusDetail: outcome.statusDetail ?? null,
        verifiedAt: new Date().toISOString(),
        rawState: outcome.rawState,
        ...feeFieldsFromOutcome(outcome),
      });
    } catch (err) {
      // Carrera: otro proceso ya la recuperó/creó — usar la fila ganadora.
      if ((err as { code?: string })?.code === "23505") {
        return this.mpOrdersRepo.findByMpId(intentId);
      }
      throw err;
    }
  }

  /**
   * Best-effort tras un DELETE exitoso en MP: deja la fila local coherente.
   * No lanza — la cancelación en MP ya está confirmada por la respuesta.
   */
  async markCanceledLocally(intentId: string): Promise<void> {
    try {
      const row = await this.mpOrdersRepo.findByMpId(intentId);
      if (!row || row.type !== "point" || HARD_TERMINAL.has(row.status)) return;
      const updated = await this.mpOrdersRepo.update(row.orderIdMp, { status: "canceled" });
      this.emitUpdated(updated);
    } catch (err) {
      console.error(`[PointPayments] No se pudo marcar cancelado localmente el intent ${intentId}:`, err);
    }
  }

  /**
   * Device con el que se CREÓ un intent (su fila en mp_orders): para operar
   * sobre el intent en MP (ej. DELETE) contra el mismo aparato, sin
   * re-resolver por la caja. `null` si el intent no está registrado.
   */
  async findIntentDeviceId(intentId: string): Promise<string | null> {
    if (!intentId?.trim()) return null;
    const row = await this.mpOrdersRepo.findByMpId(intentId.trim());
    return row?.type === "point" ? row.deviceId ?? null : null;
  }

  private async findPointRow(intentId: string): Promise<MpOrder> {
    if (!intentId?.trim()) throw new BadRequest("intentId es requerido.");
    const row = await this.mpOrdersRepo.findByMpId(intentId.trim());
    if (!row || row.type !== "point") {
      throw new NotFound(`Intento de cobro ${intentId} no registrado.`);
    }
    return row;
  }

  private async refreshVerdict(row: MpOrder): Promise<PointIntentVerdict> {
    let outcome: IntentOutcome;
    try {
      outcome = await this.mpService.resolveIntentOutcome(row.orderIdMp, row.deviceId ?? undefined);
    } catch (err) {
      // MP caído/timeout NO es un veredicto: queda 'unknown' (re-consultable) y
      // por D1 jamás se trata como cobrado.
      const message = err instanceof Error ? err.message : String(err);
      const updated = await this.persist(row, { status: "unknown", verificationError: message });
      return this.toVerdict(updated);
    }
    const patch = this.decide(row, outcome);
    const updated = await this.persist(row, patch);
    return this.toVerdict(updated);
  }

  /** El corazón del arreglo: decide con el PAGO real, nunca con el state solo. */
  private decide(row: MpOrder, outcome: IntentOutcome): PatchDecision {
    const base = { rawState: outcome.rawState };

    if (outcome.paymentStatus === "approved") {
      const paid = outcome.transactionAmount;
      if (typeof paid !== "number" || !Number.isFinite(paid)) {
        return {
          ...base,
          status: "unknown",
          paymentId: outcome.paymentId ?? null,
          paymentStatus: outcome.paymentStatus,
          paymentStatusDetail: outcome.statusDetail ?? null,
          verificationError: "MP aprobó el pago pero no informó el monto (transaction_amount).",
        };
      }
      if (paid !== Number(row.amount)) {
        return {
          ...base,
          status: "unknown",
          paymentId: outcome.paymentId ?? null,
          paymentStatus: outcome.paymentStatus,
          paymentStatusDetail: outcome.statusDetail ?? null,
          paidAmount: paid,
          verificationError: `Monto aprobado ($${paid}) distinto del solicitado ($${row.amount}).`,
        };
      }
      return {
        ...base,
        status: "processed",
        paymentId: outcome.paymentId ?? null,
        paymentStatus: outcome.paymentStatus,
        paymentStatusDetail: outcome.statusDetail ?? null,
        paidAmount: paid,
        verifiedAt: new Date().toISOString(),
        verificationError: null,
        ...feeFieldsFromOutcome(outcome),
      };
    }

    if (outcome.paymentStatus === "rejected") {
      return {
        ...base,
        status: "rejected",
        paymentId: outcome.paymentId ?? null,
        paymentStatus: outcome.paymentStatus,
        paymentStatusDetail: outcome.statusDetail ?? null,
        verifiedAt: new Date().toISOString(),
      };
    }

    if (outcome.paymentStatus === "cancelled") {
      return {
        ...base,
        status: "canceled",
        paymentId: outcome.paymentId ?? null,
        paymentStatus: outcome.paymentStatus,
        paymentStatusDetail: outcome.statusDetail ?? null,
        verifiedAt: new Date().toISOString(),
      };
    }

    // Sin pago asociado (o pago aún pendiente): decide el state + el deadline.
    const rawState = outcome.rawState ?? "";
    if (rawState === "CANCELED") {
      return { ...base, status: "canceled" };
    }
    if (rawState === "FINISHED" && !outcome.paymentId) {
      // El caso que originó R27: state terminal sin pago consultable. Jamás cobrado.
      return {
        ...base,
        status: "unknown",
        verificationError: "El intent terminó (FINISHED) sin payment.id para verificar el pago real.",
      };
    }
    if (IN_PROGRESS_STATES.has(rawState) || outcome.paymentStatus) {
      if (row.expiresAt && Date.now() > new Date(row.expiresAt).getTime()) {
        return { ...base, status: "expired" };
      }
      return { ...base, status: "created" };
    }
    return {
      ...base,
      status: "unknown",
      verificationError: `Estado del intent no reconocido: ${JSON.stringify(outcome.rawState)}.`,
    };
  }

  private async persist(row: MpOrder, patch: PatchDecision): Promise<MpOrder> {
    const updated = await this.mpOrdersRepo.update(row.orderIdMp, patch);
    if (HARD_TERMINAL.has(updated.status) || updated.status === "expired") {
      this.emitUpdated(updated);
    }
    return updated;
  }

  /** Best-effort: completa neto/fee si el primer poll no los trajo. */
  private async enrichFees(row: MpOrder): Promise<MpOrder> {
    if (!row.paymentId || row.feeStatus === "ready") return row;
    try {
      const payment = await this.mpService.getPayment(row.paymentId, row.deviceId ?? undefined);
      const fees = parsePaymentFees(payment);
      if (!fees) return row;
      return this.mpOrdersRepo.update(row.orderIdMp, {
        netReceivedAmount: fees.netReceivedAmount,
        mpFeeAmount: fees.mpFeeAmount,
        feeStatus: "ready",
      });
    } catch (err) {
      console.warn(`[PointPayments] No se pudo enriquecer fees de ${row.orderIdMp}:`, err);
      return row;
    }
  }

  /** Preparación (nadie lo consume todavía): aviso SSE en transiciones terminales. */
  private emitUpdated(row: MpOrder): void {
    this.emit?.({
      type: "mp.order.updated",
      mpOrder: {
        orderIdMp: row.orderIdMp,
        externalRef: row.externalRef,
        status: row.status,
        paymentId: row.paymentId,
        type: "point",
        amount: row.amount,
        barId: row.barId,
      },
    });
  }

  private toVerdict(row: MpOrder): PointIntentVerdict {
    const status = STATUS_TO_VERDICT[row.status] ?? "UNKNOWN";
    const verdict: PointIntentVerdict = { status };
    if (row.rawState) verdict.rawState = row.rawState;
    if (row.paymentStatusDetail) verdict.statusDetail = row.paymentStatusDetail;
    if (row.paymentId) verdict.paymentId = row.paymentId;
    if (row.expiresAt) verdict.expiresAt = row.expiresAt;
    switch (status) {
      case "REJECTED":
        verdict.reason = "Pago rechazado por Mercado Pago.";
        break;
      case "CANCELED":
        verdict.reason = "El cobro fue cancelado antes de completarse.";
        break;
      case "EXPIRED":
        verdict.reason = "El cobro venció sin confirmación de Mercado Pago.";
        break;
      case "UNKNOWN":
        verdict.reason = row.verificationError ?? "No se pudo confirmar el estado del cobro.";
        break;
    }
    return verdict;
  }
}

type PatchDecision = {
  status: MpOrderStatus;
  rawState?: string | null;
  paymentId?: string | null;
  paymentStatus?: string | null;
  paymentStatusDetail?: string | null;
  paidAmount?: number | null;
  netReceivedAmount?: number | null;
  mpFeeAmount?: number | null;
  feeStatus?: MpFeeStatus;
  verifiedAt?: string | null;
  verificationError?: string | null;
};

function needsFeeEnrichment(row: MpOrder): boolean {
  return (
    row.status === "processed" &&
    !!row.paymentId &&
    (row.feeStatus === "pending" || row.feeStatus === "none")
  );
}

function feeFieldsFromOutcome(outcome: IntentOutcome): Pick<PatchDecision, "netReceivedAmount" | "mpFeeAmount" | "feeStatus"> {
  if (
    typeof outcome.netReceivedAmount === "number" &&
    Number.isFinite(outcome.netReceivedAmount) &&
    typeof outcome.mpFeeAmount === "number" &&
    Number.isFinite(outcome.mpFeeAmount)
  ) {
    return {
      netReceivedAmount: outcome.netReceivedAmount,
      mpFeeAmount: outcome.mpFeeAmount,
      feeStatus: "ready",
    };
  }
  return { feeStatus: "pending" };
}
