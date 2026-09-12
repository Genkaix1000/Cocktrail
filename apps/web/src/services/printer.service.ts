import { apiFetch } from "./api-client";
import type { CreateOrderResult, PrintPayload, TicketContent } from "@cocktrail/shared";

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

  /** `order` solo para ghost: el server no tiene la fila y usa el snapshot. */
  splits(
    orderId: string,
    groups: { items: { drinkId: number; qty: number }[] }[],
    order?: CreateOrderResult,
  ) {
    return apiFetch<{ tickets: PrintSplitTicket[] }>(`/api/printer/splits/${orderId}`, {
      method: "POST",
      body: { groups, ...(order?.ghost ? { order } : {}) },
    });
  },
};
