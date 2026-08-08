import type { Ticket, TicketsRepository } from "../../tickets/tickets.repository.js";
import type { TestNightContext } from "./test-night-context.js";
import type { TestNightStore } from "./test-night-store.js";

/**
 * Decora el repo de tickets. Un ticket no conoce la noche: se enruta por la **orden dueña**
 * (`orderId`), que sí está en el store cuando la noche es de prueba.
 */
export class TestAwareTicketsRepository implements TicketsRepository {
  constructor(
    private readonly inner: TicketsRepository,
    private readonly context: TestNightContext,
    private readonly store: TestNightStore,
  ) {}

  private storeIsLive(): boolean {
    const event = this.store.getEvent();
    return event !== null && this.context.isTestNight(event.id);
  }

  private fromStore(predicate: (ticket: Ticket) => boolean): Ticket | undefined {
    if (!this.storeIsLive()) return undefined;
    return this.store.findTicket(predicate);
  }

  async create(ticket: Ticket): Promise<Ticket> {
    if (!this.storeIsLive() || !this.store.hasOrder(ticket.orderId)) {
      return this.inner.create(ticket);
    }
    return this.store.addTicket(ticket);
  }

  async findByCode(code: string): Promise<Ticket | undefined> {
    return this.fromStore((t) => t.code === code) ?? (await this.inner.findByCode(code));
  }

  async findByReadable(readable: string): Promise<Ticket | undefined> {
    const clean = readable.toUpperCase().trim();
    return (
      this.fromStore((t) => t.code.startsWith(`${clean}-`)) ??
      (await this.inner.findByReadable(readable))
    );
  }

  async findByOrderId(orderId: string): Promise<Ticket | undefined> {
    return (
      this.fromStore((t) => t.orderId === orderId) ?? (await this.inner.findByOrderId(orderId))
    );
  }

  async listByOrderIds(orderIds: string[]): Promise<Ticket[]> {
    if (orderIds.length === 0) return [];
    if (!this.storeIsLive()) return this.inner.listByOrderIds(orderIds);

    const enMemoria = this.store.listTickets((t) => orderIds.includes(t.orderId));
    const cubiertos = new Set(enMemoria.map((t) => t.orderId));
    const restantes = orderIds.filter((id) => !cubiertos.has(id));
    const persistidos = restantes.length > 0 ? await this.inner.listByOrderIds(restantes) : [];
    return [...persistidos, ...enMemoria];
  }

  /** SIEMPRE Supabase: los tickets de prueba no forman parte del histórico. */
  async list(): Promise<Ticket[]> {
    return this.inner.list();
  }

  async updateRedemption(
    code: string,
    redeemedBy: string,
    meta?: { barCode?: string; method?: "scan" | "manual" },
  ): Promise<Ticket | undefined> {
    const current = this.fromStore((t) => t.code === code);
    if (!current) return this.inner.updateRedemption(code, redeemedBy, meta);

    // Igual que el UPDATE ... WHERE redeemed_at IS NULL: un ticket ya canjeado no se pisa.
    if (current.redeemedAt) return undefined;

    return this.store.updateTicket(code, {
      redeemedAt: Date.now(),
      redeemedBy,
      redeemedByBar: meta?.barCode,
      redeemMethod: meta?.method,
    });
  }
}
