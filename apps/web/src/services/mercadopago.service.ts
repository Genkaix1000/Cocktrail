import { apiFetch } from "./api-client";

export type MpNormalizedStatus = "OPEN" | "ON_TERMINAL" | "FINISHED" | "CANCELED" | "PENDING";

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

  createPosIntent(amount: number, description?: string) {
    return apiFetch<{ id: string }>("/api/mercadopago/pos/intent", {
      method: "POST",
      body: { amount, description },
    });
  },

  getPosIntentStatus(id: string) {
    return apiFetch<{ status: MpNormalizedStatus; amount?: number }>(`/api/mercadopago/pos/intent/${id}`);
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
