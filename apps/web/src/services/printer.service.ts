import { apiFetch } from "./api-client";

export type PrintPayload = {
  success: boolean;
  message: string;
  /** Bytes ESC/POS en base64 para WebUSB en el dispositivo. */
  data: string;
};

export const printerService = {
  test() {
    return apiFetch<PrintPayload>("/api/printer/test", { method: "POST" });
  },

  reprint(orderId: string) {
    return apiFetch<PrintPayload>(`/api/printer/reprint/${orderId}`, { method: "POST" });
  },
};
