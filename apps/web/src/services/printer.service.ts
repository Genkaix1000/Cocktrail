import { apiFetch } from "./api-client";

export type PrinterStatus = {
  connected: boolean;
  configured: true;
  message: string;
};

export type PrintResult = {
  success: boolean;
  message: string;
};

export const printerService = {
  getStatus() {
    return apiFetch<PrinterStatus>("/api/printer/status");
  },

  test() {
    return apiFetch<PrintResult>("/api/printer/test", { method: "POST" });
  },

  reprint(orderId: string) {
    return apiFetch<PrintResult>(`/api/printer/reprint/${orderId}`, { method: "POST" });
  },
};
