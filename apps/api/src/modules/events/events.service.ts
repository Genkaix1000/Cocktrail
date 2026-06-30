import { randomUUID } from "node:crypto";
import type {
  EventSummary,
  EventTotals,
  NightEvent,
  Theme,
} from "@cocktrail/shared";
import { supabase } from "../../shared/supabase.js";
import type { EventsRepository } from "./events.repository.js";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { CashSalesRepository } from "../cash-sales/cash-sales.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import type { ConfigRepository } from "../config/config.repository.js";
import { Conflict } from "../../shared/errors/http-errors.js";
import { computeTotals } from "../../shared/utils/totals.js";
import { emit } from "../../shared/sse/sse-manager.js";
import { toSafeConfig } from "../config/config.repository.js";
import { env } from "../../config/env.js";

export class EventsService {
  private event!: NightEvent;
  private activeTheme: Theme = "normal";
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  constructor(
    private eventsRepo: EventsRepository,
    private ordersRepo: OrdersRepository,
    private cashSalesRepo: CashSalesRepository,
    private drinksRepo: DrinksRepository,
    private configRepo?: ConfigRepository,
  ) {}

  async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    // Wait up to 60 seconds for initialize to be called and complete
    const startTime = Date.now();
    const timeout = 60000;
    while (!this.isInitialized && (Date.now() - startTime) < timeout) {
      if (this.initPromise) {
        await this.initPromise;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!this.isInitialized) {
      throw new Error("El servicio de eventos no ha sido inicializado.");
    }
  }

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = (async () => {
      try {
        // 1. Get or create active event from database
        let active = await this.eventsRepo.getActive();
        
        if (active) {
          // Check if active event is from a previous calendar day
          const eventDate = new Date(active.startedAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
          const todayDate = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
          if (eventDate !== todayDate && active.startedAt < Date.now()) {
            console.log(`[EventsService] Active event ${active.id} is from a past day (${eventDate}). Auto-closing on startup...`);
            const closedAt = Date.now();
            const orders = await this.ordersRepo.listForEvent(active.id);
            const cashSales = await this.cashSalesRepo.listForEvent(active.id);
            const totals = computeTotals(orders, cashSales);
            
            active.status = "cerrado";
            active.closedAt = closedAt;
            active.closedBy = "sistema";
            
            await this.eventsRepo.update(active.id, {
              status: "cerrado",
              closedAt,
              closedBy: "sistema",
            });

            // Sync this event to cloud in background
            this.syncEventToCloudBackground(active, totals);
            
            // Force a new event creation
            active = null;
          }
        }

        if (!active) {
          active = {
            id: randomUUID(),
            status: "activo",
            startedAt: Date.now(),
            orderCounter: 0,
          };
          await this.eventsRepo.create(active);
        }
        this.event = active;

        if (this.configRepo) {
          const config = await this.configRepo.get();
          this.activeTheme = config.theme;
        }
        this.isInitialized = true;

        // Trigger automatic sync of all pending events in the background on startup
        import("../sync/sync.service.js").then(({ syncService }) => {
          syncService.syncAllPendingEvents(this.ordersRepo, this.cashSalesRepo)
            .then((res) => {
              if (res.successCount > 0 || res.failedCount > 0) {
                console.log(`[EventsService] Auto-sync completed: ${res.successCount} succeeded, ${res.failedCount} failed.`);
              }
            })
            .catch((err) => console.error("[EventsService] Auto-sync failed:", err));
        }).catch(console.error);
      } catch (err) {
        this.initPromise = null;
        throw err;
      }
    })();
    return this.initPromise;
  }

  async getCurrentEvent(): Promise<NightEvent> {
    await this.ensureInitialized();
    return this.event;
  }

  async getEventStatus(): Promise<string> {
    await this.ensureInitialized();
    return this.event.status;
  }

  async incrementOrderCounter(): Promise<number> {
    await this.ensureInitialized();
    const nextCounter = this.event.orderCounter + 1;
    this.event.orderCounter = nextCounter;
    await this.eventsRepo.update(this.event.id, { orderCounter: nextCounter });
    return nextCounter;
  }

  async getEventTotals(): Promise<EventTotals> {
    await this.ensureInitialized();
    const orders = await this.ordersRepo.listForEvent(this.event.id);
    const cashSales = await this.cashSalesRepo.listForEvent(this.event.id);
    return computeTotals(orders, cashSales);
  }

  async closeEvent(closedBy: string = "desconocido"): Promise<EventSummary> {
    await this.ensureInitialized();
    if (this.event.status !== "activo") {
      throw new Conflict("El evento ya está cerrado.");
    }

    const closedAt = Date.now();
    const orders = await this.ordersRepo.listForEvent(this.event.id);
    const cashSales = await this.cashSalesRepo.listForEvent(this.event.id);
    const totals = computeTotals(orders, cashSales);

    // Update status to closed
    this.event.status = "cerrado";
    this.event.closedAt = closedAt;
    this.event.closedBy = closedBy;

    const closedEvent = await this.eventsRepo.update(this.event.id, {
      status: "cerrado",
      closedAt,
      closedBy,
    });

    const summary: EventSummary = {
      ...closedEvent,
      totals,
      orders,
      cashSales,
    };

    emit({ type: "event.closed", summary });

    // Perform cloud sync in the background
    this.syncEventToCloudBackground(closedEvent, totals);

    // Create next active event
    const nextEvent: NightEvent = {
      id: randomUUID(),
      status: "activo",
      startedAt: Date.now(),
      orderCounter: 0,
    };
    await this.eventsRepo.create(nextEvent);
    this.event = nextEvent;

    return summary;
  }

  async listClosedEvents(): Promise<EventSummary[]> {
    await this.ensureInitialized();
    const closed = await this.eventsRepo.listClosed();
    const summaries: EventSummary[] = [];
    for (const ev of closed) {
      const orders = await this.ordersRepo.listForEvent(ev.id);
      const cashSales = await this.cashSalesRepo.listForEvent(ev.id);
      const totals = computeTotals(orders, cashSales);
      
      // Auto-cleanup: If a closed night has $0 total, delete it permanently from the database
      if (totals.total === 0) {
        console.log(`[EventsService] Night event ${ev.id} has $0 total. Automatically deleting from database...`);
        try {
          await supabase.from("night_events").delete().eq("id", ev.id);
          await supabase.from("orders").delete().eq("event_id", ev.id);
          await supabase.from("cash_sales").delete().eq("event_id", ev.id);
        } catch (dbErr) {
          console.error(`[EventsService] Failed to delete $0 event ${ev.id} from Supabase:`, dbErr);
        }
        continue; // Skip returning it to the client
      }

      summaries.push({
        ...ev,
        totals,
        orders,
        cashSales,
      });
    }
    return summaries;
  }

  async setTheme(theme: Theme): Promise<void> {
    await this.ensureInitialized();
    if (this.activeTheme === theme) return;
    this.activeTheme = theme;
    if (this.configRepo) {
      await this.configRepo.update({ theme });
    }
    const config = this.configRepo ? await this.configRepo.get() : null;
    const customTheme = config ? config.customTheme : null;
    emit({ type: "theme.changed", theme, customTheme });
  }

  async getTheme(): Promise<Theme> {
    await this.ensureInitialized();
    return this.activeTheme;
  }

  async getPublicConfig() {
    await this.ensureInitialized();
    const config = this.configRepo ? toSafeConfig(await this.configRepo.get()) : {
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
    return {
      ...config,
      eventStartedAt: this.event.startedAt,
    };
  }

  async snapshot() {
    await this.ensureInitialized();
    const drinks = await this.drinksRepo.list();
    const orders = await this.ordersRepo.listForEvent(this.event.id);
    const cashSales = await this.cashSalesRepo.listForEvent(this.event.id);
    const totals = computeTotals(orders, cashSales);
    return {
      event: this.event,
      drinks,
      orders,
      cashSales,
      totals,
      activeTheme: this.activeTheme,
    };
  }

  private async syncEventToCloudBackground(event: NightEvent, totals: EventTotals) {
    import("../sync/sync.service.js").then(({ syncService }) => {
      syncService.pushEventData(event.id, event, totals).catch(console.error);
    });
  }

  async seedClosedEvent(summary: EventSummary): Promise<void> {
    await this.ensureInitialized();
    const event: NightEvent = {
      id: summary.id,
      status: summary.status,
      startedAt: summary.startedAt,
      closedAt: summary.closedAt,
      orderCounter: summary.orderCounter,
      closedBy: summary.closedBy,
    };
    await this.eventsRepo.create(event);

    for (const o of summary.orders) {
      await this.ordersRepo.create(o, event.id);
    }

    for (const cs of summary.cashSales) {
      await this.cashSalesRepo.add(cs, event.id);
    }
  }
}
