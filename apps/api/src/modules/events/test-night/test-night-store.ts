import type { NightEvent, Order } from "@cocktrail/shared";
import type { Ticket } from "../../tickets/tickets.repository.js";

/**
 * Store en memoria de la noche de prueba: la noche, sus pedidos y sus tickets.
 *
 * Vive y muere con el proceso a propósito (criterio A6 de la spec): una noche de prueba
 * no deja rastro en ningún lado, ni siquiera en disco.
 *
 * Todo lo que entra y sale se copia superficialmente para imitar la semántica de la base:
 * quien recibe un `Order` no puede mutar el store de rebote.
 */
export class TestNightStore {
  private event: NightEvent | null = null;
  private orders: Order[] = [];
  private tickets: Ticket[] = [];

  // ── Noche ──

  setEvent(event: NightEvent): NightEvent {
    this.event = { ...event };
    return { ...this.event };
  }

  getEvent(): NightEvent | null {
    return this.event ? { ...this.event } : null;
  }

  updateEvent(updates: Partial<NightEvent>): NightEvent | null {
    if (!this.event) return null;
    this.event = { ...this.event, ...updates };
    return { ...this.event };
  }

  // ── Pedidos ──

  addOrder(order: Order): Order {
    const copy = { ...order };
    this.orders.push(copy);
    return { ...copy };
  }

  hasOrder(id: string): boolean {
    return this.orders.some((o) => o.id === id);
  }

  findOrder(predicate: (order: Order) => boolean): Order | undefined {
    const found = this.orders.find(predicate);
    return found ? { ...found } : undefined;
  }

  /** Ordenados por `createdAt` ascendente, igual que el repo de Supabase. */
  listOrders(): Order[] {
    return [...this.orders]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((o) => ({ ...o }));
  }

  updateOrder(id: string, updates: Partial<Order>): Order | undefined {
    const idx = this.orders.findIndex((o) => o.id === id);
    if (idx === -1) return undefined;
    const updated = { ...this.orders[idx]!, ...updates };
    this.orders[idx] = updated;
    return { ...updated };
  }

  // ── Tickets ──

  addTicket(ticket: Ticket): Ticket {
    const copy = { ...ticket };
    this.tickets.push(copy);
    return { ...copy };
  }

  findTicket(predicate: (ticket: Ticket) => boolean): Ticket | undefined {
    const found = this.tickets.find(predicate);
    return found ? { ...found } : undefined;
  }

  listTickets(predicate?: (ticket: Ticket) => boolean): Ticket[] {
    const source = predicate ? this.tickets.filter(predicate) : this.tickets;
    return source.map((t) => ({ ...t }));
  }

  updateTicket(code: string, updates: Partial<Ticket>): Ticket | undefined {
    const idx = this.tickets.findIndex((t) => t.code === code);
    if (idx === -1) return undefined;
    const updated = { ...this.tickets[idx]!, ...updates };
    this.tickets[idx] = updated;
    return { ...updated };
  }

  // ── Ciclo de vida ──

  reset(): void {
    this.event = null;
    this.orders = [];
    this.tickets = [];
  }
}
