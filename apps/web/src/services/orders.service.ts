import { apiFetch } from "./api-client";
import type { NewOrderInput, Order, OrderStatus } from "@cocktrail/shared";

export const ordersService = {
  create(input: NewOrderInput) {
    return apiFetch<Order>("/api/orders", { method: "POST", body: input });
  },

  updateStatus(id: string, status: OrderStatus) {
    return apiFetch<Order>(`/api/orders/${id}`, {
      method: "PATCH",
      body: { status },
    });
  },

  getByToken(token: string) {
    return apiFetch<Order>(`/api/orders/by-token/${token}`);
  },

  listActive() {
    return apiFetch<Order[]>("/api/orders/active");
  },

  list() {
    return apiFetch<Order[]>("/api/orders");
  },

  getAuditLogs(all?: boolean) {
    const url = all ? "/api/orders/log?all=true" : "/api/orders/log";
    return apiFetch<Order[]>(url);
  },
};
