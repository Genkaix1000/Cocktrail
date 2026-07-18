import { env } from "../../config/env.js";
import { Unauthorized } from "../../shared/errors/http-errors.js";
import type { EmitFn } from "../../shared/sse/sse-manager.js";
import { validateWebhookSignature } from "./mercadopago-webhook-signature.js";
import type { MercadoPagoOrdersService } from "./mercadopago-orders.service.js";
import type { MpOrderStatus } from "./mp-orders.repository.js";

export type MpWebhookBody = {
  action?: string;
  type?: string;
  live_mode?: boolean;
  data?: { id?: string };
};

export type MpWebhookRequest = {
  dataId?: string;
  type?: string;
  xSignature?: string;
  xRequestId?: string;
  body: MpWebhookBody;
};

/**
 * Webhooks de Orders API (Fase 6).
 * Valida HMAC, responde rápido y reconcilia async contra GET /v1/orders/{id}.
 */
export class MercadoPagoWebhooksService {
  constructor(
    private readonly mpOrdersService: MercadoPagoOrdersService,
    private readonly emit: EmitFn,
  ) {}

  /**
   * Valida la firma y encola el trabajo pesado. El controller debe responder 200
   * inmediatamente después de llamar a este método.
   */
  handleWebhook(req: MpWebhookRequest): void {
    const secret = env.MP_WEBHOOK_SECRET;
    if (!secret) {
      throw new Unauthorized("Webhook no configurado (MP_WEBHOOK_SECRET ausente).");
    }

    if (
      !validateWebhookSignature(req.xSignature, req.xRequestId, req.dataId, secret)
    ) {
      throw new Unauthorized("Firma de webhook inválida.");
    }

    const type = req.type ?? req.body.type;
    const orderId = req.dataId;

    if (type !== "order" || !orderId?.trim()) {
      if (type && type !== "order") {
        console.info(
          `[MP Webhook] Evento ignorado (type=${type}, action=${req.body.action ?? "n/a"})`,
        );
      }
      return;
    }

    const action = req.body.action;
    setImmediate(() => {
      void this.processOrderNotification(orderId.trim(), action, req.body.live_mode);
    });
  }

  private async processOrderNotification(
    orderId: string,
    action?: string,
    liveMode?: boolean,
  ): Promise<void> {
    try {
      const result = await this.mpOrdersService.reconcileFromMp(orderId);
      if (!result) {
        console.info(`[MP Webhook] Order ${orderId} no encontrada localmente — ignorada.`);
        return;
      }

      const { mpOrder, statusDetail } = result;
      const isPartialRefund =
        mpOrder.status === "processed" && statusDetail === "partially_refunded";

      console.info(
        `[MP Webhook] Reconciliada ${orderId}: status=${mpOrder.status}` +
          (action ? ` action=${action}` : "") +
          (liveMode !== undefined ? ` live_mode=${liveMode}` : "") +
          (isPartialRefund ? " (partial refund)" : ""),
      );

      this.emitMpOrderUpdated(mpOrder, action, isPartialRefund);

      // Impacto en pedidos Cocktrail: hoy el pedido se crea desde el frontend tras
      // confirmar el pago (polling). La reconciliación vive en mp_orders + SSE.
      // Cuando exista orders.external_ref, concretarPedido/cancelarPedido irían aquí.
    } catch (err) {
      console.error(`[MP Webhook] Error procesando order ${orderId}:`, err);
    }
  }

  private emitMpOrderUpdated(
    mpOrder: {
      orderIdMp: string;
      externalRef: string;
      status: MpOrderStatus;
      paymentId: string | null;
      type: "qr" | "point";
      amount: number;
      barId: string | null;
    },
    action?: string,
    isPartialRefund?: boolean,
  ): void {
    this.emit({
      type: "mp.order.updated",
      mpOrder: {
        orderIdMp: mpOrder.orderIdMp,
        externalRef: mpOrder.externalRef,
        status: mpOrder.status,
        paymentId: mpOrder.paymentId,
        type: mpOrder.type,
        amount: mpOrder.amount,
        barId: mpOrder.barId,
      },
      action,
      isPartialRefund,
    });
  }
}
