import { apiFetch } from "./api-client";
import type { Drink } from "@cocktrail/shared";

export const drinksService = {
  list() {
    return apiFetch<Drink[]>("/api/drinks");
  },

  create(input: Omit<Drink, "id">) {
    return apiFetch<Drink>("/api/drinks", { method: "POST", body: input });
  },

  update(id: number, partial: Partial<Omit<Drink, "id">>) {
    return apiFetch<Drink>(`/api/drinks/${id}`, { method: "PATCH", body: partial });
  },

  delete(id: number) {
    return apiFetch<{ ok: true }>(`/api/drinks/${id}`, { method: "DELETE" });
  },
};
