import { apiFetch } from "./api-client";
import type { Order } from "@cocktrail/shared";

export interface RedeemResponse {
  success: boolean;
  order: Order;
  status: "success";
}

export const ticketsService = {
  redeem(code: string) {
    return apiFetch<RedeemResponse>("/api/tickets/redeem", {
      method: "POST",
      body: { code },
    });
  },
};
