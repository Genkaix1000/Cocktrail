import { apiFetch } from "./api-client";

export type MpNormalizedStatus = "OPEN" | "ON_TERMINAL" | "FINISHED" | "CANCELED" | "PENDING";

export const mercadopagoService = {
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
