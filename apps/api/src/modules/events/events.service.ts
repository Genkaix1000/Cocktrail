import { randomUUID } from "node:crypto";
import type {
  CashSale,
  EventSummary,
  EventTotals,
  NightEvent,
  Order,
  Theme,
} from "@cocktrail/shared";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { CashSalesRepository } from "../cash-sales/cash-sales.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import type { ConfigRepository } from "../config/config.repository.js";
import { Conflict } from "../../shared/errors/http-errors.js";
import { computeTotals } from "../../shared/utils/totals.js";
import { emit } from "../../shared/sse/sse-manager.js";
import { toSafeConfig } from "../config/config.repository.js";

const HISTORY_CAP = 60;

export class EventsService {
  private event: NightEvent;
  private closedEvents: EventSummary[] = [];
  private activeTheme: Theme = "normal";

  constructor(
    private ordersRepo: OrdersRepository,
    private cashSalesRepo: CashSalesRepository,
    private drinksRepo: DrinksRepository,
    private configRepo?: ConfigRepository,
  ) {
    this.event = {
      id: randomUUID(),
      status: "activo",
      startedAt: Date.now(),
      orderCounter: 0,
    };
    if (configRepo) {
      this.activeTheme = configRepo.get().theme;
    }
  }

  getCurrentEvent(): NightEvent {
    return this.event;
  }

  getEventStatus(): string {
    return this.event.status;
  }

  incrementOrderCounter(): number {
    this.event.orderCounter += 1;
    return this.event.orderCounter;
  }

  getEventTotals(): EventTotals {
    return computeTotals(
      this.ordersRepo.list(),
      this.cashSalesRepo.list(),
    );
  }

  closeEvent(): EventSummary {
    if (this.event.status !== "activo") {
      throw new Conflict("El evento ya está cerrado.");
    }

    this.event.status = "cerrado";
    this.event.closedAt = Date.now();

    const summary: EventSummary = {
      ...this.event,
      totals: this.getEventTotals(),
      orders: this.ordersRepo.list(),
      cashSales: this.cashSalesRepo.list(),
    };

    this.closedEvents.unshift(summary);
    if (this.closedEvents.length > HISTORY_CAP) {
      this.closedEvents.length = HISTORY_CAP;
    }

    emit({ type: "event.closed", summary });

    // Reset
    this.event = {
      id: randomUUID(),
      status: "activo",
      startedAt: Date.now(),
      orderCounter: 0,
    };
    this.ordersRepo.clear();
    this.cashSalesRepo.clear();

    return summary;
  }

  listClosedEvents(): EventSummary[] {
    return [...this.closedEvents];
  }

  setTheme(theme: Theme): void {
    if (this.activeTheme === theme) return;
    this.activeTheme = theme;
    if (this.configRepo) {
      this.configRepo.update({ theme });
    }
    const customTheme = this.configRepo ? this.configRepo.get().customTheme : null;
    emit({ type: "theme.changed", theme, customTheme });
  }

  getTheme(): Theme {
    return this.activeTheme;
  }

  getPublicConfig() {
    if (this.configRepo) {
      return toSafeConfig(this.configRepo.get());
    }
    return {
      theme: this.activeTheme,
      brandName: "Cocktrail",
      logoUrl: "",
      customTheme: null,
      clubId: "cocktrail_club_01",
      clubName: "Bosko Club",
      useLogoUrl: false,
      logoSize: 40,
      textLogoValue: "Cocktrail",
      textLogoSize: 26,
    };
  }

  snapshot() {
    return {
      event: this.getCurrentEvent(),
      drinks: this.drinksRepo.list(),
      orders: this.ordersRepo.list(),
      cashSales: this.cashSalesRepo.list(),
      totals: this.getEventTotals(),
      activeTheme: this.activeTheme,
    };
  }

  /** Seed para el demo — agrega un EventSummary fabricado al historial. */
  seedClosedEvent(summary: EventSummary): void {
    this.closedEvents.push(summary);
    this.closedEvents.sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
    if (this.closedEvents.length > HISTORY_CAP) {
      this.closedEvents.length = HISTORY_CAP;
    }
  }
}
