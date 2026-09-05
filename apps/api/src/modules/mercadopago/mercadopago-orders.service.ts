import { randomUUID } from "node:crypto";
import type { NightEvent } from "@cocktrail/shared";
import { env } from "../../config/env.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";
import type { BarsRepository } from "./bars.repository.js";
import type { CredentialsResolverService } from "./credentials-resolver.service.js";
import type { MercadoPagoCajasRepository } from "./mercadopago-cajas.repository.js";
import { MpApiError } from "./mercadopago.service.js";
import { isFetchTimeout, MP_HTTP_TIMEOUT_MS } from "./mp-http.js";
import type {
  MpOrder,
  MpOrderStatus,
  MpOrdersRepository,
  MpOrderUpdate,
} from "./mp-orders.repository.js";
import { parsePaymentFees, type MpPaymentFeeFields } from "./mp-payment-fees.js";

const MP_API = "https://api.mercadopago.com";
// Coherente con expiration_time: "PT15M" en el create.
const QR_EXPIRATION_MS = 15 * 60 * 1000;
const FINAL_STATUSES: ReadonlySet<MpOrderStatus> = new Set([
  "processed",
  "canceled",
  "refunded",
  "expired",
  "failed",
]);
// "action_required" y "unknown" NO son terminales: el corte lo pone la
// expiración del QR (A10) del lado del cliente, no un mapeo optimista.
const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  "created",
  "processed",
  "canceled",
  "refunded",
  "expired",
  "failed",
  "action_required",
]);

export type CreateQrOrderInput = {
  amount: number;
  barId?: string;
  description?: string;
  /** Semilla estable por intento de cobro (la genera el frontend). Sin ella se genera una por request. */
  idempotencyKey?: string;
};

export type CreateQrOrderResult = {
  orderId: string;
  qrImage: string | null;
  status: MpOrderStatus;
  expiresAt: string;
};

type MpOrderPayment = {
  id?: string;
  reference_id?: string | number;
  amount?: string;
  status?: string;
  status_detail?: string;
};

type MpOrderResponse = {
  id: string;
  status?: string;
  status_detail?: string;
  type?: string;
  external_reference?: string;
  transactions?: {
    payments?: MpOrderPayment[];
  };
  /** Presente en mode dynamic/hybrid — trama EMVCo para dibujar el QR. */
  type_response?: {
    qr_data?: string;
  };
};

export type MpOrderReconcileResult = {
  mpOrder: MpOrder;
  mpType?: string;
  statusDetail?: string;
};

/**
 * Cobro QR dinámico vía Orders API.
 * Crea/consulta/cancela orders `type: "qr"` `mode: "dynamic"` contra el POS de la barra.
 * No requiere Posnet Point: sí requiere Store+POS (`external_pos_id`).
 */
export class MercadoPagoOrdersService {
  private readonly baseUrl = MP_API;

  constructor(
    private readonly credentialsResolver: CredentialsResolverService,
    private readonly barsRepo: BarsRepository,
    private readonly cajasRepo: MercadoPagoCajasRepository,
    private readonly mpOrdersRepo: MpOrdersRepository,
    private readonly getActiveEvent: () => Promise<NightEvent | null>,
    private readonly isGhostMode: () => Promise<boolean> = async () => false,
  ) {}

  private async resolveChargeToken(barId?: string | null): Promise<string> {
    const useGhost = await this.isGhostMode();
    return this.credentialsResolver.resolve({
      barId: barId ?? undefined,
      allowGlobalFallback: !useGhost,
      useGhost,
    });
  }

  async createQrOrder(input: CreateQrOrderInput): Promise<CreateQrOrderResult> {
    if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequest("amount es requerido y debe ser un número positivo.");
    }

    // Semilla estable: si el frontend la manda, un doble click / reintento con la
    // misma key devuelve la order ya creada sin volver a tocar MP.
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const existing = await this.mpOrdersRepo.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return this.replayExistingOrder(existing, input.amount);
    }

    const event = await this.getActiveEvent();
    if (!event || event.status !== "activo") {
      throw new Conflict(
        "No hay una noche abierta. Abrila desde /admin para poder cobrar.",
        "NO_ACTIVE_EVENT",
      );
    }
    // Un cobro de MP se registra contra la noche en la base, y una noche de prueba no
    // existe ahí. Se rechaza de entrada en vez de fallar de forma confusa después.
    if (event.isTest) {
      throw new Conflict("Noche de prueba: solo efectivo.", "TEST_NIGHT");
    }

    const barIdOrCode = (input.barId?.trim() || env.BAR_CODE).trim();
    const bar = await this.resolveBar(barIdOrCode);
    const caja = await this.cajasRepo.findByBarId(bar.id);
    if (!caja) {
      throw new Conflict(
        "Barra sin caja MP configurada. Ejecutar Fase 3 primero.",
        "CAJA_NOT_PROVISIONED",
      );
    }

    const token = await this.resolveChargeToken(bar.id);

    const amountStr = input.amount.toFixed(2);
    const externalRef = this.buildExternalRef(idempotencyKey);
    const description =
      (typeof input.description === "string" && input.description.trim()) ||
      `Consumo ${bar.name ?? bar.code ?? "barra"}`;
    const itemTitle = `Consumo ${bar.name ?? bar.code ?? "barra"}`;

    const response = await this.mpRequest<MpOrderResponse>(
      token,
      "/v1/orders",
      {
        method: "POST",
        headers: { "X-Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          type: "qr",
          external_reference: externalRef,
          total_amount: amountStr,
          description,
          expiration_time: "PT15M",
          config: {
            qr: {
              external_pos_id: caja.externalPosId,
              mode: "dynamic",
            },
          },
          transactions: {
            payments: [{ amount: amountStr }],
          },
          items: [
            {
              title: itemTitle,
              unit_price: amountStr,
              quantity: 1,
              unit_measure: "unit",
            },
          ],
        }),
      },
      "Error al crear la order QR en Mercado Pago",
    );

    // payments[0].id al crear es la transacción, NO el payment_id real.
    const paymentTransactionId = response.transactions?.payments?.[0]?.id ?? null;
    const expiresAt = new Date(Date.now() + QR_EXPIRATION_MS).toISOString();
    // type_response.qr_data = trama EMVCo (mode dynamic). El frontend la dibuja.
    const qrData = response.type_response?.qr_data?.trim() || null;
    if (!qrData) {
      throw new Conflict(
        "Mercado Pago no devolvió qr_data para el cobro dinámico. Reintentá o verificá que el POS exista en la cuenta.",
        "QR_DATA_MISSING",
      );
    }

    try {
      await this.mpOrdersRepo.create({
        orderIdMp: response.id,
        externalRef,
        idempotencyKey,
        paymentTransactionId,
        amount: amountStr,
        status: "created",
        type: "qr",
        barId: bar.id,
        cajaId: caja.id,
        eventId: event.id,
        qrData,
        expiresAt,
      });
    } catch (err) {
      // Carrera de 2 POSTs simultáneos con la misma key: MP dedupe por
      // X-Idempotency-Key y acá dedupe el UNIQUE — devolver la fila que ganó.
      if ((err as { code?: string })?.code === "23505") {
        const winner = await this.mpOrdersRepo.findByIdempotencyKey(idempotencyKey);
        if (winner) return this.replayExistingOrder(winner, input.amount);
      }
      throw err;
    }

    return {
      orderId: response.id,
      // Contrato legacy del frontend: campo `qrImage` (payload para renderizar).
      qrImage: qrData,
      status: "created",
      expiresAt,
    };
  }

  /** Replay idempotente: misma key + mismo monto → misma respuesta, 0 llamadas a MP. */
  private replayExistingOrder(existing: MpOrder, amount: number): CreateQrOrderResult {
    if (Number(existing.amount) !== amount) {
      throw new Conflict(
        "Esa idempotency key ya se usó con otro monto. Generá un cobro nuevo.",
        "IDEMPOTENCY_AMOUNT_MISMATCH",
      );
    }
    return {
      orderId: existing.orderIdMp,
      qrImage: existing.qrData,
      status: existing.status,
      expiresAt:
        existing.expiresAt ??
        // Filas pre-migración sin expires_at: derivarlo del created_at + PT15M.
        new Date(new Date(existing.createdAt).getTime() + QR_EXPIRATION_MS).toISOString(),
    };
  }

  async getOrderStatus(orderId: string, _barId?: string): Promise<MpOrder> {
    if (!orderId?.trim()) throw new BadRequest("orderId es requerido.");

    const order = await this.mpOrdersRepo.findByMpId(orderId.trim());
    if (!order) throw new NotFound(`Order ${orderId} no encontrada.`);

    if (FINAL_STATUSES.has(order.status)) {
      // Reintento lazy de fees si el cobro ya cerró sin neto de MP.
      if (
        order.status === "processed" &&
        order.paymentId &&
        (order.feeStatus === "pending" || order.feeStatus === "none")
      ) {
        const token = await this.resolveChargeToken(order.barId);
        return this.enrichFees(order, token);
      }
      return order;
    }

    const token = await this.resolveChargeToken(order.barId);

    const mpOrder = await this.mpRequest<MpOrderResponse>(
      token,
      `/v1/orders/${encodeURIComponent(order.orderIdMp)}`,
      { method: "GET" },
      "Error al consultar la order en Mercado Pago",
    );

    const updated = await this.mpOrdersRepo.update(order.orderIdMp, this.buildStatusPatch(order, mpOrder));
    if (updated.status === "processed" && updated.paymentId && updated.feeStatus !== "ready") {
      return this.enrichFees(updated, token);
    }
    return updated;
  }

  /**
   * Completa neto/fee de cobros processed con fee_status=pending.
   * Idempotente: filas already ready no se tocan.
   */
  async backfillFees(limit = 50): Promise<{ checked: number; updated: number; unavailable: number }> {
    const rows = await this.mpOrdersRepo.findProcessedPendingFees(limit);
    let updated = 0;
    let unavailable = 0;
    for (const row of rows) {
      const token = await this.resolveChargeToken(row.barId);
      const before = row.feeStatus;
      const after = await this.enrichFees(row, token);
      if (after.feeStatus === "ready" && before !== "ready") updated += 1;
      if (after.feeStatus === "unavailable") unavailable += 1;
    }
    return { checked: rows.length, updated, unavailable };
  }

  /**
   * Criterio B en el camino QR: al CONCRETAR (processed) se verifica el monto
   * aprobado contra lo pedido y se persisten paid_amount/status_detail. Va acá
   * (al momento de concretar) y no en cada poll: el short-circuit de filas ya
   * finales en getOrderStatus nunca re-ejecuta esta verificación.
   */
  private buildStatusPatch(order: MpOrder, mpOrder: MpOrderResponse) {
    const newStatus = this.mapMpStatus(mpOrder.status);
    // El payment_id real llega en reference_id al consultar; no pisar con el id de transacción.
    const payment = mpOrder.transactions?.payments?.[0];
    const paymentId =
      payment?.reference_id != null ? String(payment.reference_id) : null;

    if (newStatus !== "processed") {
      return {
        status: newStatus,
        ...(paymentId ? { paymentId } : {}),
        ...(payment?.status_detail ? { paymentStatusDetail: payment.status_detail } : {}),
      };
    }

    // payments[0].amount viene en PESOS como string ("101.00").
    const paidAmount = payment?.amount != null ? Number(payment.amount) : NaN;
    if (!paymentId || !Number.isFinite(paidAmount)) {
      return {
        status: "unknown" as const,
        verificationError: "MP reportó processed sin payment_id/monto verificable.",
        ...(payment?.status_detail ? { paymentStatusDetail: payment.status_detail } : {}),
      };
    }
    if (paidAmount !== Number(order.amount)) {
      return {
        status: "unknown" as const,
        paymentId,
        paidAmount,
        verificationError: `Monto aprobado ($${paidAmount}) distinto del solicitado ($${order.amount}).`,
        ...(payment?.status_detail ? { paymentStatusDetail: payment.status_detail } : {}),
      };
    }
    return {
      status: "processed" as const,
      paymentId,
      paidAmount,
      feeStatus: "pending" as const,
      verifiedAt: new Date().toISOString(),
      verificationError: null,
      ...(payment?.status_detail ? { paymentStatusDetail: payment.status_detail } : {}),
      ...(payment?.status ? { paymentStatus: payment.status } : {}),
    };
  }

  /** Best-effort: nunca tira — el cobro ya está concreto. */
  private async enrichFees(order: MpOrder, token: string): Promise<MpOrder> {
    if (!order.paymentId || order.feeStatus === "ready") return order;
    try {
      const payment = await this.mpRequest<MpPaymentFeeFields & { id?: string }>(
        token,
        `/v1/payments/${encodeURIComponent(order.paymentId)}`,
        { method: "GET" },
        "Error al consultar el pago en Mercado Pago",
      );
      const fees = parsePaymentFees(payment);
      if (!fees) {
        return this.mpOrdersRepo.update(order.orderIdMp, { feeStatus: "pending" });
      }
      const patch: MpOrderUpdate = {
        netReceivedAmount: fees.netReceivedAmount,
        mpFeeAmount: fees.mpFeeAmount,
        feeStatus: "ready",
      };
      return this.mpOrdersRepo.update(order.orderIdMp, patch);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404") || /not found/i.test(msg)) {
        try {
          return await this.mpOrdersRepo.update(order.orderIdMp, { feeStatus: "unavailable" });
        } catch {
          return order;
        }
      }
      console.warn(`[MP Orders] No se pudo enriquecer fees de ${order.orderIdMp}:`, msg);
      return order;
    }
  }

  /**
   * Consulta GET /v1/orders/{id} y actualiza mp_orders con el estado real.
   * Usado por webhooks (Fase 6) y como fuente de verdad ante notificaciones MP.
   */
  async reconcileFromMp(orderIdMp: string): Promise<MpOrderReconcileResult | null> {
    const order = await this.mpOrdersRepo.findByMpId(orderIdMp.trim());
    if (!order) return null;

    const token = await this.resolveChargeToken(order.barId);

    const mpOrder = await this.mpRequest<MpOrderResponse>(
      token,
      `/v1/orders/${encodeURIComponent(order.orderIdMp)}`,
      { method: "GET" },
      "Error al consultar la order en Mercado Pago",
    );

    // Misma verificación de monto que getOrderStatus: el webhook también es
    // un camino de concretar y el CHECK de DB exige paid_amount en processed.
    let updated = await this.mpOrdersRepo.update(order.orderIdMp, this.buildStatusPatch(order, mpOrder));
    if (updated.status === "processed" && updated.paymentId && updated.feeStatus !== "ready") {
      updated = await this.enrichFees(updated, token);
    }

    const payment = mpOrder.transactions?.payments?.[0];
    return {
      mpOrder: updated,
      mpType: mpOrder.type,
      statusDetail: mpOrder.status_detail ?? payment?.status_detail,
    };
  }

  async cancelQrOrder(orderId: string, _barId?: string): Promise<{ status: "canceled" }> {
    if (!orderId?.trim()) throw new BadRequest("orderId es requerido.");

    const order = await this.mpOrdersRepo.findByMpId(orderId.trim());
    if (!order) throw new NotFound(`Order ${orderId} no encontrada.`);

    if (order.status !== "created") {
      throw new Conflict(
        `Solo cancelable en estado 'created' (actual: ${order.status}).`,
        "ORDER_NOT_CANCELABLE",
      );
    }

    const token = await this.resolveChargeToken(order.barId);

    await this.mpRequest<MpOrderResponse>(
      token,
      `/v1/orders/${encodeURIComponent(order.orderIdMp)}/cancel`,
      {
        method: "POST",
        headers: { "X-Idempotency-Key": randomUUID() },
      },
      "Error al cancelar la order QR en Mercado Pago",
    );

    await this.mpOrdersRepo.updateStatus(order.orderIdMp, "canceled");
    return { status: "canceled" };
  }

  private mapMpStatus(raw: string | undefined): MpOrderStatus {
    if (raw && KNOWN_STATUSES.has(raw)) return raw as MpOrderStatus;
    // MP a veces usa "cancelled" (doble L) — normalizar.
    if (raw === "cancelled") return "canceled";
    // Nunca mapear un estado desconocido a algo optimista: queda 'unknown'
    // (no terminal) y el corte lo pone la expiración del QR.
    console.warn(`[MP Orders] Estado desconocido de MP: ${JSON.stringify(raw)} — se registra como 'unknown'.`);
    return "unknown";
  }

  /** external_reference: máx 64 chars, sin PII, derivado estable de la idempotency key. */
  private buildExternalRef(idempotencyKey: string): string {
    return `COCKTRAIL-${idempotencyKey}`.slice(0, 64);
  }

  private async resolveBar(barIdOrCode: string) {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRe.test(barIdOrCode)) {
      const byId = await this.barsRepo.findById(barIdOrCode);
      if (!byId) throw new NotFound(`Barra ${barIdOrCode} no encontrada.`);
      return byId;
    }
    const byCode = await this.barsRepo.findByCode(barIdOrCode);
    if (!byCode) {
      throw new Conflict(
        `Barra ${barIdOrCode} no encontrada. Provisioná el PDV (Fase 3) primero.`,
        "BAR_NOT_FOUND",
      );
    }
    return byCode;
  }

  private async mpRequest<T>(
    token: string,
    path: string,
    init: RequestInit,
    errorMessage: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(MP_HTTP_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
    } catch (err) {
      if (isFetchTimeout(err)) {
        throw new Conflict(
          `${errorMessage}: Mercado Pago no respondió en ${MP_HTTP_TIMEOUT_MS / 1000} segundos. Probá de nuevo.`,
          "MP_TIMEOUT",
        );
      }
      throw err;
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`MP Orders Error (${path}):`, errData);
      const mpMessage =
        (errData as { message?: string })?.message || response.statusText;
      const mpError =
        (errData as { error?: string })?.error ||
        (errData as { code?: string })?.code ||
        "";

      if (mpError === "pos_not_found" || String(mpMessage).includes("pos_not_found")) {
        throw new Conflict(
          `${errorMessage}: el external_pos_id no existe en MP (${mpMessage})`,
          "POS_NOT_FOUND",
        );
      }
      if (
        mpError === "idempotency_key_already_used" ||
        String(mpMessage).includes("idempotency_key_already_used")
      ) {
        throw new Conflict(
          `${errorMessage}: idempotency key ya usada (${mpMessage})`,
          "IDEMPOTENCY_KEY_USED",
        );
      }

      throw new MpApiError(`${errorMessage}: ${mpMessage}`, mpError, errData);
    }

    // Cancel puede devolver 200 con body vacío en algunos casos.
    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  /** Diagnóstico admin: últimas filas de mp_orders. */
  listRecentOrders(limit: number): Promise<MpOrder[]> {
    return this.mpOrdersRepo.listRecent(limit);
  }
}
