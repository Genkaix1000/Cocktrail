import { apiFetch } from "./api-client";
import type {
  CashSale,
  CustomTheme,
  Drink,
  EventSummary,
  EventTotals,
  NightEvent,
  Order,
  Theme,
} from "@cocktrail/shared";

type StateSnapshot = {
  event: NightEvent | null;
  drinks: Drink[];
  orders: Order[];
  cashSales: CashSale[];
  totals: EventTotals;
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

  openEvent(keyword: string) {
    return apiFetch<NightEvent>("/api/events/open", {
      method: "POST",
      body: { keyword },
    });
  },

  setKeyword(keyword: string) {
    return apiFetch<NightEvent>("/api/events/current/keyword", {
      method: "PATCH",
      body: { keyword },
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

  getPublicConfig() {
    return apiFetch<{
      theme: Theme;
      customTheme: CustomTheme | null;
      eventStartedAt: number;
    }>("/api/theme");
  },
};
