import { randomBytes, randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";
import type { BarsRepository } from "./bars.repository.js";
import type { CredentialsResolverService } from "./credentials-resolver.service.js";
import type { MercadoPagoCajasRepository } from "./mercadopago-cajas.repository.js";
import { MpApiError } from "./mercadopago.service.js";
import type {
  MpOrder,
  MpOrderStatus,
  MpOrdersRepository,
} from "./mp-orders.repository.js";

const MP_API = "https://api.mercadopago.com";
const FINAL_STATUSES: ReadonlySet<MpOrderStatus> = new Set([
  "processed",
  "canceled",
  "refunded",
  "expired",
]);
const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  "created",
  "processed",
  "canceled",
  "refunded",
  "expired",
]);

export type CreateQrOrderInput = {
  amount: number;
  barId?: string;
  description?: string;
};

export type CreateQrOrderResult = {
  orderId: string;
  qrImage: string | null;
  status: "created";
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
};

export type MpOrderReconcileResult = {
  mpOrder: MpOrder;
  mpType?: string;
  statusDetail?: string;
};

/**
 * Cobro QR estático vía Orders API (Fase 4).
 * Crea/consulta/cancela orders `type: "qr"` `mode: "static"` contra el POS de la barra.
 */
export class MercadoPagoOrdersService {
  private readonly baseUrl = MP_API;

  constructor(
    private readonly credentialsResolver: CredentialsResolverService,
    private readonly barsRepo: BarsRepository,
    private readonly cajasRepo: MercadoPagoCajasRepository,
    private readonly mpOrdersRepo: MpOrdersRepository,
  ) {}

  async createQrOrder(input: CreateQrOrderInput): Promise<CreateQrOrderResult> {
    if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequest("amount es requerido y debe ser un número positivo.");
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

    const token = await this.credentialsResolver.resolve({
      barId: bar.id,
      allowGlobalFallback: true,
    });

    const amountStr = input.amount.toFixed(2);
    const externalRef = this.buildExternalRef();
    const idempotencyKey = randomUUID();
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
              mode: "static",
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
    });

    return {
      orderId: response.id,
      qrImage: caja.qrImage,
      status: "created",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  async getOrderStatus(orderId: string, _barId?: string): Promise<MpOrder> {
    if (!orderId?.trim()) throw new BadRequest("orderId es requerido.");

    const order = await this.mpOrdersRepo.findByMpId(orderId.trim());
    if (!order) throw new NotFound(`Order ${orderId} no encontrada.`);

    if (FINAL_STATUSES.has(order.status)) {
      return order;
    }

    const token = await this.credentialsResolver.resolve({
      barId: order.barId ?? undefined,
      allowGlobalFallback: true,
    });

    const mpOrder = await this.mpRequest<MpOrderResponse>(
      token,
      `/v1/orders/${encodeURIComponent(order.orderIdMp)}`,
      { method: "GET" },
      "Error al consultar la order en Mercado Pago",
    );

    const newStatus = this.mapMpStatus(mpOrder.status);
    // El payment_id real llega en reference_id al consultar; no pisar con el id de transacción.
    const payment = mpOrder.transactions?.payments?.[0];
    const paymentId =
      payment?.reference_id != null ? String(payment.reference_id) : null;

    return this.mpOrdersRepo.update(order.orderIdMp, {
      status: newStatus,
      ...(paymentId ? { paymentId } : {}),
    });
  }

  /**
   * Consulta GET /v1/orders/{id} y actualiza mp_orders con el estado real.
   * Usado por webhooks (Fase 6) y como fuente de verdad ante notificaciones MP.
   */
  async reconcileFromMp(orderIdMp: string): Promise<MpOrderReconcileResult | null> {
    const order = await this.mpOrdersRepo.findByMpId(orderIdMp.trim());
    if (!order) return null;

    const token = await this.credentialsResolver.resolve({
      barId: order.barId ?? undefined,
      allowGlobalFallback: true,
    });

    const mpOrder = await this.mpRequest<MpOrderResponse>(
      token,
      `/v1/orders/${encodeURIComponent(order.orderIdMp)}`,
      { method: "GET" },
      "Error al consultar la order en Mercado Pago",
    );

    const newStatus = this.mapMpStatus(mpOrder.status);
    const payment = mpOrder.transactions?.payments?.[0];
    const paymentId =
      payment?.reference_id != null ? String(payment.reference_id) : null;

    const updated = await this.mpOrdersRepo.update(order.orderIdMp, {
      status: newStatus,
      ...(paymentId ? { paymentId } : {}),
    });

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

    const token = await this.credentialsResolver.resolve({
      barId: order.barId ?? undefined,
      allowGlobalFallback: true,
    });

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
    return "created";
  }

  /** external_reference: máx 64 chars, sin PII. */
  private buildExternalRef(): string {
    const ts = Date.now().toString(36);
    const rand = randomBytes(2).toString("hex");
    return `COCKTRAIL-${ts}-${rand}`.slice(0, 64);
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
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

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
}
