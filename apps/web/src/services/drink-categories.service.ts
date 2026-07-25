import { apiFetch } from "./api-client";
import type { DrinkCategory } from "@cocktrail/shared";

export const drinkCategoriesService = {
  list() {
    return apiFetch<DrinkCategory[]>("/api/drink-categories");
  },

  create(input: { name: string; sortOrder?: number }) {
    return apiFetch<DrinkCategory>("/api/drink-categories", { method: "POST", body: input });
  },

  update(id: string, partial: { name?: string; sortOrder?: number }) {
    return apiFetch<DrinkCategory>(`/api/drink-categories/${id}`, {
      method: "PATCH",
      body: partial,
    });
  },

  reorder(ids: string[]) {
    return apiFetch<DrinkCategory[]>("/api/drink-categories/reorder", {
      method: "PUT",
      body: { ids },
    });
  },

  delete(id: string) {
    return apiFetch<{ ok: true }>(`/api/drink-categories/${id}`, { method: "DELETE" });
  },
};
