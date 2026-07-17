import { apiFetch } from "./api-client";

export type MpNormalizedStatus = "OPEN" | "ON_TERMINAL" | "FINISHED" | "CANCELED" | "PENDING";

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
};
