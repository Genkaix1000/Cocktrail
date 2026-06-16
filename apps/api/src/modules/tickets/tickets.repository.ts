export interface Ticket {
  id: string;
  orderId: string;
  code: string;
  createdAt: number;
  redeemedAt?: number;
  redeemedBy?: string;
  redeemedByBar?: string;
  redeemMethod?: "scan" | "manual";
}

export interface TicketsRepository {
  create(ticket: Ticket): Ticket;
  findByCode(code: string): Ticket | undefined;
  findByReadable(readable: string): Ticket | undefined;
  findByOrderId(orderId: string): Ticket | undefined;
  list(): Ticket[];
  updateRedemption(
    code: string,
    redeemedBy: string,
    meta?: { barCode?: string; method?: "scan" | "manual" },
  ): Ticket;
  clear(): void;
}

export class InMemoryTicketsRepository implements TicketsRepository {
  private tickets = new Map<string, Ticket>(); // key is the ticket code

  create(ticket: Ticket): Ticket {
    this.tickets.set(ticket.code, ticket);
    return ticket;
  }

  findByCode(code: string): Ticket | undefined {
    return this.tickets.get(code);
  }

  findByReadable(readable: string): Ticket | undefined {
    const search = readable.toUpperCase().trim();
    for (const ticket of this.tickets.values()) {
      const parts = ticket.code.split("-");
      if (parts[0] === search) {
        return ticket;
      }
    }
    return undefined;
  }

  findByOrderId(orderId: string): Ticket | undefined {
    for (const ticket of this.tickets.values()) {
      if (ticket.orderId === orderId) return ticket;
    }
    return undefined;
  }

  list(): Ticket[] {
    return Array.from(this.tickets.values());
  }

  updateRedemption(
    code: string,
    redeemedBy: string,
    meta?: { barCode?: string; method?: "scan" | "manual" },
  ): Ticket {
    const ticket = this.tickets.get(code);
    if (!ticket) {
      throw new Error(`Ticket with code ${code} not found in repository`);
    }
    ticket.redeemedAt = Date.now();
    ticket.redeemedBy = redeemedBy;
    if (meta?.barCode) ticket.redeemedByBar = meta.barCode;
    if (meta?.method) ticket.redeemMethod = meta.method;
    return ticket;
  }

  clear(): void {
    this.tickets.clear();
  }
}
