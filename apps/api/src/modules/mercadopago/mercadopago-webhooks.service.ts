import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { Unauthorized } from "../../shared/errors/http-errors.js";
import type { EmitFn } from "../../shared/sse/sse-manager.js";
import { validateWebhookSignature } from "./mercadopago-webhook-signature.js";
import type { MercadoPagoOrdersService } from "./mercadopago-orders.service.js";
import type { MpOrderStatus } from "./mp-orders.repository.js";
import type {
  MpWebhookEvent,
  MpWebhookEventsRepository,
} from "./mp-webhook-events.repository.js";

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
 * Valida HMAC + frescura, persiste el evento ANTES de responder 200 (durabilidad:
 * si el proceso muere después del 200, replayPending() lo retoma en el boot) y
 * reconcilia async contra GET /v1/orders/{id}.
 */
export class MercadoPagoWebhooksService {
  /** Evita drains concurrentes cuando llegan varios webhooks juntos. */
  private replaying = false;

  constructor(
    private readonly mpOrdersService: MercadoPagoOrdersService,
    private readonly webhookEventsRepo: MpWebhookEventsRepository,
    private readonly emit: EmitFn,
  ) {}

  /**
   * Valida la firma, persiste el evento y encola el trabajo pesado. El controller
   * debe responder 200 recién cuando este método resuelve: si el INSERT falla,
   * MP recibe 500 y reintenta — el evento no se pierde.
   */
  async handleWebhook(req: MpWebhookRequest): Promise<void> {
    const secret = env.MP_WEBHOOK_SECRET;
    if (!secret) {
      throw new Unauthorized("Webhook no configurado (MP_WEBHOOK_SECRET ausente).");
    }

    if (
      !validateWebhookSignature(
        req.xSignature,
        req.xRequestId,
        req.dataId,
        secret,
        env.MP_WEBHOOK_TS_TOLERANCE_SECONDS,
      )
    ) {
      throw new Unauthorized("Firma de webhook inválida o vencida.");
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

    // INSERT antes del 200. Sin x-request-id no hay dedupe posible: se registra
    // igual con un id sintético para no perder el evento.
    const inserted = await this.webhookEventsRepo.insert({
      xRequestId: req.xRequestId ?? `sin-request-id-${randomUUID()}`,
      dataId: orderId.trim(),
      type,
      payload: req.body,
    });

    if (inserted.duplicate) {
      console.info(
        `[MP Webhook] Reintento de MP ya registrado (x-request-id=${req.xRequestId}) — 200 sin reprocesar.`,
      );
      return;
    }

    setImmediate(() => {
      void this.processStoredEvent(inserted.event).then(() => this.replayPending());
    });
  }

  /**
   * Reprocesa en serie los eventos persistidos sin procesar (attempts < 5).
   * Llamado en el boot (después del runner de migraciones) y como drain
   * oportunista al llegar un webhook nuevo.
   */
  async replayPending(): Promise<void> {
    if (this.replaying) return;
    this.replaying = true;
    try {
      const pending = await this.webhookEventsRepo.findPending();
      if (pending.length === 0) return;

      console.info(`[MP Webhook] Reprocesando ${pending.length} evento(s) pendiente(s)...`);
      for (const event of pending) {
        await this.processStoredEvent(event);
      }
    } finally {
      this.replaying = false;
    }
  }

  private async processStoredEvent(event: MpWebhookEvent): Promise<void> {
    const body = (event.payload ?? {}) as MpWebhookBody;
    try {
      if (event.dataId?.trim()) {
        await this.processOrderNotification(event.dataId.trim(), body.action, body.live_mode);
      }
      await this.webhookEventsRepo.markProcessed(event.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[MP Webhook] Error procesando evento ${event.id} (order ${event.dataId}):`, err);
      try {
        await this.webhookEventsRepo.markFailed(event.id, message);
      } catch (markErr) {
        console.error(`[MP Webhook] No se pudo registrar el fallo del evento ${event.id}:`, markErr);
      }
    }
  }

  private async processOrderNotification(
    orderId: string,
    action?: string,
    liveMode?: boolean,
  ): Promise<void> {
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
