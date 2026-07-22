import { apiFetch } from "./api-client";

/**
 * Veredicto verificado del cobro con Posnet (GET /pos/intent/:id). Ya no es el
 * `state` crudo del intent: FINISHED significa "pago approved verificado con
 * monto correcto" contra /v1/payments. REJECTED ≠ CANCELED a propósito.
 */
export type PosIntentVerdictStatus =
  | "PENDING"
  | "FINISHED"
  | "REJECTED"
  | "CANCELED"
  | "EXPIRED"
  | "UNKNOWN";

export type PosIntentVerdict = {
  status: PosIntentVerdictStatus;
  /** Estado crudo del intent en MP (OPEN/ON_TERMINAL/…) — solo para mensajes de progreso. */
  rawState?: string;
  reason?: string;
  /** Motivo de MP en un rechazo (ej. cc_rejected_insufficient_amount). */
  statusDetail?: string;
  paymentId?: string;
  expiresAt?: string;
};

export type CreatePosIntentResponse = {
  id: string;
  /** Deadline server-side del cobro — el hook lo usa para el corte local del polling. */
  expiresAt: string;
  idempotencyKeyUsed?: string;
  externalReferenceUsed?: string;
  deviceIdUsed?: string;
};

export type MpQrOrderStatus =
  | "created"
  | "processed"
  | "canceled"
  | "refunded"
  | "expired"
  | "failed"
  | "action_required"
  // Catch-all del backend para estados que MP invente: no es terminal, el corte
  // lo pone el expiresAt en el hook.
  | "unknown";

export type PosnetDeviceStatus = {
  connected: boolean;
  message: string;
  device?: { model: string; serialNumber: string; operatingMode: string };
};

export type MpSellerStatus = {
  linked: boolean;
  status: "active" | "expired" | null;
  nickname: string | null;
  email: string | null;
  linkedAt: string | null;
  displayName: string | null;
};

export type CreateQrOrderResponse = {
  orderId: string;
  qrImage: string | null;
  status: "created";
  expiresAt: string;
};

export type QrOrderStatusResponse = {
  orderIdMp: string;
  status: MpQrOrderStatus;
  paymentId: string | null;
  amount: number;
  qrImage?: string | null;
  // Null para orders creadas antes de la migración que agregó expires_at.
  expiresAt?: string | null;
};

export const mercadopagoService = {
  /** Fase 1 — pide al backend la URL de autorización OAuth (PKCE) para vincular la cuenta MP. */
  getOAuthUrl(barId?: string) {
    const qs = barId ? `?barId=${encodeURIComponent(barId)}` : "";
    return apiFetch<{ url: string }>(`/api/mercadopago/oauth/url${qs}`);
  },

  /** Fase 1 — estado de vinculación OAuth del vendedor (para la UI de Pagos). */
  getSellerStatus(barId?: string) {
    const qs = barId ? `?barId=${encodeURIComponent(barId)}` : "";
    return apiFetch<MpSellerStatus>(`/api/mercadopago/seller-status${qs}`);
  },

  getDeviceStatus() {
    return apiFetch<PosnetDeviceStatus>("/api/mercadopago/device/status");
  },

  testDeviceCharge() {
    return apiFetch<{ reachedDevice: boolean; message: string }>("/api/mercadopago/device/test-charge", {
      method: "POST",
    });
  },

  /** Fase 5 — test $15 contra un Posnet específico. */
  testDeviceChargeFor(deviceId: string) {
    return apiFetch<{ reachedDevice: boolean; message: string }>("/api/mercadopago/device/test-charge", {
      method: "POST",
      body: { deviceId },
    });
  },

  /**
   * `attemptId`: semilla estable por intento de cobro (misma semántica que la
   * idempotencyKey del QR). `items`: el carrito viaja al backend, que lo
   * persiste como respaldo server-side de la venta (sobrevive al cierre de la
   * pestaña).
   */
  createPosIntent(
    amount: number,
    description?: string,
    opts?: { attemptId?: string; items?: { drinkId: number; qty: number }[] },
  ) {
    return apiFetch<CreatePosIntentResponse>("/api/mercadopago/pos/intent", {
      method: "POST",
      body: {
        amount,
        description,
        ...(opts?.attemptId ? { attemptId: opts.attemptId } : {}),
        ...(opts?.items ? { items: opts.items } : {}),
      },
    });
  },

  getPosIntentStatus(id: string) {
    return apiFetch<PosIntentVerdict>(`/api/mercadopago/pos/intent/${id}`);
  },

  /**
   * Re-consulta MP y devuelve el veredicto actualizado, incluso si el intent
   * quedó EXPIRED — recupera un cobro desde otro dispositivo/pestaña (D6).
   */
  resolvePosIntent(id: string) {
    return apiFetch<PosIntentVerdict>(`/api/mercadopago/pos/intent/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
    });
  },

  cancelPosIntent(id: string) {
    return apiFetch<{ status: string }>(`/api/mercadopago/pos/intent/${id}`, {
      method: "DELETE",
    });
  },

  /**
   * Fase 4 — crea order QR estática (carga el QR fijo de la barra con el monto).
   * `idempotencyKey`: semilla por intento de cobro — reenviarla con el mismo
   * amount devuelve la MISMA order (protege contra doble click y reintentos de red).
   */
  createQrOrder(
    amount: number,
    description?: string,
    opts?: { barId?: string; idempotencyKey?: string },
  ) {
    return apiFetch<CreateQrOrderResponse>("/api/mercadopago/orders/qr", {
      method: "POST",
      body: {
        amount,
        description,
        ...(opts?.barId ? { barId: opts.barId } : {}),
        ...(opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
      },
    });
  },

  getQrOrderStatus(orderId: string) {
    return apiFetch<QrOrderStatusResponse>(`/api/mercadopago/orders/${encodeURIComponent(orderId)}/status`);
  },

  cancelQrOrder(orderId: string) {
    return apiFetch<{ status: "canceled" }>(
      `/api/mercadopago/orders/${encodeURIComponent(orderId)}/cancel`,
      { method: "POST" },
    );
  },
};
