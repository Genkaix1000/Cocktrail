import { apiFetch } from "./api-client";
import type { CashSale, NewCashSaleInput } from "@cocktrail/shared";

export const cashSalesService = {
  add(input: NewCashSaleInput) {
    return apiFetch<CashSale>("/api/cash-sales", { method: "POST", body: input });
  },

  list() {
    return apiFetch<CashSale[]>("/api/cash-sales");
  },
};
