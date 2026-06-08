import { apiFetch } from "./api-client";
import type { EventSummary, Theme } from "@cocktrail/shared";

type StateSnapshot = {
  event: import("@cocktrail/shared").NightEvent;
  drinks: import("@cocktrail/shared").Drink[];
  orders: import("@cocktrail/shared").Order[];
  cashSales: import("@cocktrail/shared").CashSale[];
  totals: import("@cocktrail/shared").EventTotals;
  activeTheme: Theme;
};

export const eventsService = {
  getState() {
    return apiFetch<StateSnapshot>("/api/state");
  },

  closeEvent(password: string) {
    return apiFetch<EventSummary>("/api/event/close", {
      method: "POST",
      body: { password },
    });
  },

  setTheme(theme: Theme) {
    return apiFetch<{ success: boolean; theme: Theme }>("/api/theme", {
      method: "POST",
      body: { theme },
    });
  },

  getHistory() {
    return apiFetch<EventSummary[]>("/api/events/history");
  },
};
