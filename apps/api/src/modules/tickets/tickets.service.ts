import type { TicketsRepository, Ticket } from "./tickets.repository.js";
import type { OrdersService } from "../orders/orders.service.js";
import { generateTicketCode, verifyTicketIntegrity } from "./tickets.crypto.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";
import { randomUUID } from "node:crypto";
import type { Order } from "@cocktrail/shared";

// Max hours a ticket is valid (e.g. 6 hours)
const MAX_TICKET_AGE_MS = 6 * 60 * 60 * 1000;

export class TicketsService {
  constructor(
    private ticketsRepo: TicketsRepository,
    private ordersService: OrdersService,
    private secret: string,
  ) {}

  /**
   * Generates a signed ticket code for a given order, saves it in the repository,
   * and returns the code string.
   */
  async generateForOrder(orderId: string): Promise<string> {
    const code = this.generateCodeString(orderId);
    await this.saveTicketForOrder(orderId, code);
    return code;
  }

  generateCodeString(orderId: string): string {
    return generateTicketCode(orderId, this.secret);
  }

  async saveTicketForOrder(orderId: string, code: string): Promise<void> {
    const ticket: Ticket = {
      id: randomUUID(),
      orderId,
      code,
      createdAt: Date.now(),
    };
    await this.ticketsRepo.create(ticket);
    // function returns void
  }

  /**
   * Redeems a ticket, changing the associated order status to "entregado".
   * Throws detailed HTTP errors for not found, signature validation failure, or duplicate scan.
   * If code is exactly 8 characters, resolves the ticket via its human-readable prefix.
   */
  async redeemTicket(
    code: string,
    username: string,
    options?: { barCode?: string; method?: "scan" | "manual" },
  ): Promise<Order> {
    let ticket: Ticket | undefined;
    const cleanCode = code.trim();

    // Support human-readable fallback (first 8 characters prefix)
    if (cleanCode.length === 8) {
      ticket = await this.ticketsRepo.findByReadable(cleanCode);
    } else {
      ticket = await this.ticketsRepo.findByCode(cleanCode);
    }

    if (!ticket) {
      throw new NotFound("Ticket no existe");
    }

    // Verify cryptographic signature (only if we have the full ticket code to verify against)
    const isValid = verifyTicketIntegrity(ticket.code, ticket.orderId, this.secret);
    if (!isValid) {
      throw new BadRequest("Ticket inválido (firma corrupta)");
    }

    // Double-spend check
    if (ticket.redeemedAt) {
      const timeStr = new Date(ticket.redeemedAt).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      throw new Conflict(`Ticket ya canjeado a las ${timeStr}`);
    }

    // Expiration check (fail-fast if ticket is older than 6 hours)
    if (Date.now() - ticket.createdAt > MAX_TICKET_AGE_MS) {
      throw new BadRequest("Ticket expirado (superó el límite de 6 horas)");
    }

    // Fetch order to verify existence
    const order = await this.ordersService.getOrder(ticket.orderId);
    if (!order) {
      throw new NotFound("Pedido asociado no encontrado");
    }

    if (order.status !== "pendiente") {
      throw new Conflict(`El pedido está en un estado (${order.status}) que no se puede entregar.`);
    }
    const updatedOrder = await this.ordersService.updateOrderStatus(order.id, "entregado", username, {
      deliveredByBar: options?.barCode,
      redeemMethod: options?.method ?? "scan",
    });

    // Mark ticket as redeemed
    await this.ticketsRepo.updateRedemption(ticket.code, username, {
      barCode: options?.barCode,
      method: options?.method ?? "scan",
    });

    return updatedOrder;
  }

  async getTicketByOrderId(orderId: string): Promise<Ticket | undefined> {
    return this.ticketsRepo.findByOrderId(orderId);
  }
}
