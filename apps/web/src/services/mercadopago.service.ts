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
  /** Diagnóstico: user_id de MP (nunca el token). */
  userId: string | null;
  expiresAt: string | null;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
};

export type MpWebhookEventRow = {
  id: string;
  xRequestId: string;
  dataId: string | null;
  type: string | null;
  payload: unknown;
  receivedAt: string;
  processedAt: string | null;
  attempts: number;
  lastError: string | null;
};

export type MpWebhookEventsResponse = {
  available: boolean;
  events: MpWebhookEventRow[];
  webhookSecretConfigured: boolean;
};

export type MpRecentOrderRow = {
  id: string;
  orderIdMp: string;
  externalRef: string;
  paymentId: string | null;
  amount: number;
  status: string;
  type: "qr" | "point";
  barId: string | null;
  deviceId: string | null;
  rawState: string | null;
  paymentStatus: string | null;
  paymentStatusDetail: string | null;
  paidAmount: number | null;
  feeStatus: string;
  verificationError: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Un chequeo del panel de salud (gestion-posnets bloque G). `ok: null` =
 * desconocido — NUNCA se pinta rojo ni bloquea (cero falsos positivos que
 * paren la caja). `action` solo acompaña a los rojos.
 */
export type MpHealthCheck = { ok: boolean | null; detail: string; action?: string };

/** Fila F1 del panel: estado del fallback de emergencia (MP_ACCESS_TOKEN + MP_POS_DEVICE_ID). */
export type MpFallbackStatus = {
  status: "usable" | "unusable" | "unknown";
  tokenUserId?: string;
  deviceSeen?: boolean;
  operatingMode?: string;
  reason?: string;
  checkedAt: string | null;
  /** F1.a — quedó marcado si un cobro real degradó al fallback de env. */
  lastDegradedAt?: string;
  lastDegradedReason?: string;
};

export type MpHealth = {
  checks: {
    /** R21: exactamente 1 seller activo. */
    singleSeller: MpHealthCheck;
    /** El listado de devices de las credenciales activas contiene el device de la caja. */
    deviceOwnership: MpHealthCheck;
    /** operating_mode REAL (el del listado de MP) === "PDV". */
    deviceMode: MpHealthCheck;
    /** R22: caja.sellerUserId === sellerActivo.userId (huérfana si no). */
    cajaProvisioned: MpHealthCheck;
  };
  fallback: MpFallbackStatus;
  /** D2: algún cobro de este proceso se resolvió por MP_POS_DEVICE_ID. */
  usingEnvDevice: boolean;
  /** true ⟺ deviceOwnership.ok === false — bloquea Tarjeta (Posnet). */
  blocking: boolean;
  /** Hay Posnet activo vinculado a la caja. Sin esto, Tarjeta se deshabilita; QR sigue OK. */
  hasLinkedDevice: boolean;
  checkedAt: string;
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
    const params = new URLSearchParams();
    if (barId) params.set("barId", barId);
    // F1: origen explícito — los GET same-origin a veces no mandan header Origin,
    // y sin esto la EF cae al fallback NEXT_PUBLIC_SITE_URL (Render).
    if (typeof window !== "undefined" && window.location?.origin) {
      params.set("redirectUrl", window.location.origin);
    }
    const qs = params.toString();
    return apiFetch<{ url: string }>(`/api/mercadopago/oauth/url${qs ? `?${qs}` : ""}`);
  },

  /** Fase 1 — estado de vinculación OAuth del vendedor (para la UI de Pagos). */
  getSellerStatus(barId?: string) {
    const qs = barId ? `?barId=${encodeURIComponent(barId)}` : "";
    return apiFetch<MpSellerStatus>(`/api/mercadopago/seller-status${qs}`);
  },

  /**
   * D9 — desvincula la cuenta MP (wipe de tokens local + Cloud). `cloudCleaned: false`
   * significa que el seller local se limpió pero Cloud no se pudo limpiar (sin conexión):
   * queda limpieza pendiente para reintentar con internet.
   */
  unlinkSeller() {
    return apiFetch<{ ok: boolean; cloudCleaned: boolean }>("/api/mercadopago/oauth/seller", {
      method: "DELETE",
    });
  },

  getDeviceStatus() {
    return apiFetch<PosnetDeviceStatus>("/api/mercadopago/device/status");
  },

  /**
   * Bloque G — salud de la vinculación con MP (admin + caja). El cache de 30s
   * es server-side; `refresh` fuerza el re-chequeo contra MP.
   */
  getMpHealth(refresh = false) {
    return apiFetch<MpHealth>(`/api/mercadopago/health${refresh ? "?refresh=1" : ""}`);
  },

  listWebhookEvents(limit = 20) {
    return apiFetch<MpWebhookEventsResponse>(
      `/api/mercadopago/webhooks/events?limit=${encodeURIComponent(String(limit))}`,
    );
  },

  listRecentOrders(limit = 20) {
    return apiFetch<{ orders: MpRecentOrderRow[] }>(
      `/api/mercadopago/orders/recent?limit=${encodeURIComponent(String(limit))}`,
    );
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
