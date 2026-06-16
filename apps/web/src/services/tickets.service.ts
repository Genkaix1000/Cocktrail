import { apiFetch } from "./api-client";
import type { Order } from "@cocktrail/shared";

export interface RedeemResponse {
  success: boolean;
  order: Order;
  status: "success";
}

export interface RedeemOptions {
  barCode?: string;
  method?: "scan" | "manual";
}

export const ticketsService = {
  redeem(code: string, options?: RedeemOptions) {
    return apiFetch<RedeemResponse>("/api/tickets/redeem", {
      method: "POST",
      body: { code, ...options },
    });
  },
};
