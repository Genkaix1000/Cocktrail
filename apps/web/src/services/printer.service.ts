import { apiFetch } from "./api-client";
import type { PrintPayload, TicketContent } from "@cocktrail/shared";

export type { PrintPayload };

export type PrintSplitTicket = {
  ticketData: string;
  ticketContent: TicketContent;
};

export const printerService = {
  test() {
    return apiFetch<PrintPayload>("/api/printer/test", { method: "POST" });
  },

  reprint(orderId: string) {
    return apiFetch<PrintPayload>(`/api/printer/reprint/${orderId}`, { method: "POST" });
  },

  splits(orderId: string, groups: { items: { drinkId: number; qty: number }[] }[]) {
    return apiFetch<{ tickets: PrintSplitTicket[] }>(`/api/printer/splits/${orderId}`, {
      method: "POST",
      body: { groups },
    });
  },
};
