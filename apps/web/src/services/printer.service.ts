import { apiFetch } from "./api-client";
import type { PrintPayload } from "@cocktrail/shared";

export type { PrintPayload };

export const printerService = {
  test() {
    return apiFetch<PrintPayload>("/api/printer/test", { method: "POST" });
  },

  reprint(orderId: string) {
    return apiFetch<PrintPayload>(`/api/printer/reprint/${orderId}`, { method: "POST" });
  },
};
