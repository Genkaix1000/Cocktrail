import { apiFetch } from "./api-client";
import type {
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
  totals: EventTotals;
  activeTheme: Theme;
};

/**
 * Resumen de lo que se pierde al borrar una noche. Lo calcula la función
 * `preview_night` en Postgres — los montos vienen en pesos.
 */
export type NightDeletionPreview = {
  eventId: string;
  status: "activo" | "cerrado";
  /** Fecha de la noche en huso argentino, `YYYY-MM-DD`. Es lo que hay que tipear para confirmar. */
  fechaAr: string;
  keyword: string | null;
  startedAt: string;
  closedAt: string | null;
  pedidos: number;
  pedidosCancelados: number;
  /** Pesos, excluye los pedidos cancelados. */
  totalFacturado: number;
  tickets: number;
  cashSales: number;
  cashSalesMonto: number;
  mpOrders: number;
  mpOrdersCobrados: number;
  mpMontoCobrado: number;
  /** Cobros de MP de la noche detectados solo por la venta asociada (`event_id` nulo, sin backfill). */
  mpSinEventId: number;
};

export type NightDeletionResult = NightDeletionPreview & {
  borrado: {
    orders: number;
    tickets: number;
    cashSales: number;
    mpOrders: number;
    webhooksNeutralizados: number;
    /** Cobros que respaldaban una venta de OTRA noche: se desligaron en vez de borrarse. */
    mpOrdersDesligados: number;
  };
  operator: string;
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

  /** `isTest` solo lo puede mandar el rol admin: el server responde 403 si lo manda caja. */
  openEvent(keyword: string, isTest?: boolean) {
    return apiFetch<NightEvent>("/api/events/open", {
      method: "POST",
      body: isTest ? { keyword, isTest: true } : { keyword },
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

  getDeletionPreview(id: string) {
    return apiFetch<NightDeletionPreview>(
      `/api/events/${encodeURIComponent(id)}/deletion-preview`,
    );
  },

  /**
   * Borra la noche y todo lo que cuelga de ella. `fecha` (`YYYY-MM-DD`) la
   * revalida el server contra la fecha real de la noche: la confirmación
   * tipeada no es solo cosmética de la UI.
   */
  deleteNight(id: string, fecha: string, password: string) {
    return apiFetch<NightDeletionResult>(`/api/events/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: { password, fecha },
    });
  },

  getPublicConfig() {
    return apiFetch<{
      theme: Theme;
      customTheme: CustomTheme | null;
      eventStartedAt: number;
    }>("/api/theme");
  },
};
