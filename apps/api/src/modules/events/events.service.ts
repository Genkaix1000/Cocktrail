import { randomUUID } from "node:crypto";
import type {
  EventSummary,
  EventTotals,
  NightEvent,
  Theme,
} from "@cocktrail/shared";
import type { EventsRepository } from "./events.repository.js";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import type { ConfigRepository } from "../config/config.repository.js";
import { BadRequest, Conflict } from "../../shared/errors/http-errors.js";
import { computeTotals } from "@cocktrail/shared";
import type { EmitFn } from "../../shared/sse/sse-manager.js";
import { toSafeConfig } from "../config/config.repository.js";
import { claveDiaArgentina } from "../../shared/utils/fechas.js";

export class EventsService {
  private event: NightEvent | null = null;
  private activeTheme: Theme = "bosko";
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  constructor(
    private eventsRepo: EventsRepository,
    private ordersRepo: OrdersRepository,
    private drinksRepo: DrinksRepository,
    private emit: EmitFn,
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
          // Día calendario argentino: una noche que arrancó el viernes 23:00 y sigue
          // abierta al reiniciar el server a las 02:00 del sábado se auto-cierra. Es el
          // comportamiento que ya había; lo importante es que el "día" sea el de acá y
          // no el de UTC (que cambia a las 21:00 hora local).
          const eventDate = claveDiaArgentina(active.startedAt);
          const todayDate = claveDiaArgentina();
          if (eventDate !== todayDate && active.startedAt < Date.now()) {
            console.log(`[EventsService] Active event ${active.id} is from a past day (${eventDate}). Auto-closing on startup...`);
            const closedAt = Date.now();

            active.status = "cerrado";
            active.closedAt = closedAt;
            active.closedBy = "sistema";
            
            await this.eventsRepo.update(active.id, {
              status: "cerrado",
              closedAt,
              closedBy: "sistema",
            });

            // Force a new event creation
            active = null;
          }
        }

        // Ya no se auto-crea una noche nueva: queda `null` hasta que la admin la abra
        // manualmente desde /admin (POST /api/events/open), para que `startedAt` refleje
        // el inicio real del turno, no el arranque del server.
        this.event = active;

        if (this.configRepo) {
          const config = await this.configRepo.get();
          this.activeTheme = config.theme;
        }
        this.isInitialized = true;
      } catch (err) {
        this.initPromise = null;
        throw err;
      }
    })();
    return this.initPromise;
  }

  async getCurrentEvent(): Promise<NightEvent | null> {
    await this.ensureInitialized();
    return this.event;
  }

  async getEventStatus(): Promise<string> {
    await this.ensureInitialized();
    return this.event?.status ?? "sin_evento";
  }

  async incrementOrderCounter(): Promise<number> {
    await this.ensureInitialized();
    if (!this.event) throw new Conflict("Todavía no se abrió la noche. Pedile al admin que la abra desde /admin para poder cobrar.");
    const nextCounter = this.event.orderCounter + 1;
    this.event.orderCounter = nextCounter;
    await this.eventsRepo.update(this.event.id, { orderCounter: nextCounter });
    return nextCounter;
  }

  async getEventTotals(): Promise<EventTotals> {
    await this.ensureInitialized();
    if (!this.event) return computeTotals([]);
    const orders = await this.ordersRepo.listForEvent(this.event.id);
    return computeTotals(orders);
  }

  async openEvent(keyword: string): Promise<NightEvent> {
    await this.ensureInitialized();
    if (this.event && this.event.status === "activo") {
      throw new Conflict("Ya hay una noche activa. Cerrala antes de abrir una nueva.");
    }
    const trimmed = keyword.trim();
    if (!trimmed) {
      throw new BadRequest("La palabra clave es obligatoria para abrir la noche.");
    }
    const newEvent: NightEvent = {
      id: randomUUID(),
      status: "activo",
      startedAt: Date.now(),
      orderCounter: 0,
      keyword: trimmed,
    };
    await this.eventsRepo.create(newEvent);
    this.event = newEvent;
    this.emit({ type: "event.opened", event: newEvent });
    return newEvent;
  }

  async setKeyword(keyword: string): Promise<NightEvent> {
    await this.ensureInitialized();
    if (!this.event || this.event.status !== "activo") {
      throw new Conflict("No hay ninguna noche activa para editar.");
    }
    const trimmed = keyword.trim();
    if (!trimmed) {
      throw new BadRequest("La palabra clave no puede quedar vacía.");
    }
    const updated = await this.eventsRepo.update(this.event.id, { keyword: trimmed });
    this.event = updated;
    return updated;
  }

  async closeEvent(closedBy: string = "desconocido"): Promise<EventSummary> {
    await this.ensureInitialized();
    if (!this.event || this.event.status !== "activo") {
      throw new Conflict("No hay ninguna noche activa para cerrar.");
    }

    const closedAt = Date.now();
    const orders = await this.ordersRepo.listForEvent(this.event.id);
    const totals = computeTotals(orders);

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
    };

    this.emit({ type: "event.closed", summary });

    if (totals.total === 0) {
      // Noche cerrada sin ventas: se elimina en vez de archivarse, así no se acumulan
      // noches vacías en el historial. orders/tickets cascadean por ON DELETE CASCADE.
      console.log(`[EventsService] Noche ${closedEvent.id} cerrada sin ventas — se elimina en vez de archivarse.`);
      try {
        await this.eventsRepo.delete(closedEvent.id);
      } catch (dbErr) {
        console.error(`[EventsService] No se pudo eliminar la noche vacía ${closedEvent.id}:`, dbErr);
      }
    }

    // Ya no se crea la noche siguiente automáticamente: queda sin noche activa
    // hasta que la admin abra una manualmente (POST /api/events/open).
    this.event = null;

    return summary;
  }

  async listClosedEvents(): Promise<EventSummary[]> {
    await this.ensureInitialized();
    const closed = await this.eventsRepo.listClosed();
    const summaries: EventSummary[] = [];
    for (const ev of closed) {
      const orders = await this.ordersRepo.listForEvent(ev.id);
      const totals = computeTotals(orders);

      // Filtro de presentación: las noches en $0 no se muestran en el Historial,
      // pero NO se tocan en la base. Antes acá se las borraba (efecto colateral
      // destructivo en un camino de lectura), lo que además peleaba con el restore:
      // las noches vacías de Cloud volvían a bajar en cada restore y se borraban
      // de nuevo, en un ciclo infinito. La limpieza real vive en
      // src/scripts/cleanup-empty-nights.ts (manual) o en closeEvent() (una noche que
      // cierra en $0 se elimina en vez de archivarse).
      if (totals.total === 0) continue;

      summaries.push({
        ...ev,
        totals,
        orders,
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
    this.emit({ type: "theme.changed", theme, customTheme });
  }

  /**
   * Sincroniza el cache en memoria del tema activo sin volver a persistir ni emitir SSE —
   * para cuando el caller (ej. config.controller) ya persistió y va a emitir el broadcast él mismo.
   */
  syncActiveTheme(theme: Theme): void {
    this.activeTheme = theme;
  }

  async getTheme(): Promise<Theme> {
    await this.ensureInitialized();
    return this.activeTheme;
  }

  async getPublicConfig() {
    await this.ensureInitialized();
    const config = this.configRepo ? toSafeConfig(await this.configRepo.get()) : {
      theme: this.activeTheme,
      brandName: "Bosko",
      logoUrl: "/bosko.webp",
      customTheme: null,
      clubId: "cocktrail_club_01",
      clubName: "Bosko Club",
      useLogoUrl: true,
      logoSize: 56,
      textLogoValue: "Bosko",
      textLogoSize: 26,
    };
    return {
      ...config,
      eventStartedAt: this.event?.startedAt ?? null,
    };
  }

  async snapshot() {
    await this.ensureInitialized();
    const drinks = await this.drinksRepo.list();
    const orders = this.event ? await this.ordersRepo.listForEvent(this.event.id) : [];
    const totals = computeTotals(orders);
    return {
      event: this.event,
      drinks,
      orders,
      totals,
      activeTheme: this.activeTheme,
    };
  }

}
