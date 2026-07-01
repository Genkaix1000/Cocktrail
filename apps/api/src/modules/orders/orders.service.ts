import { randomBytes, randomUUID } from "node:crypto";
import type { NewOrderInput, Order, OrderStatus, NightEvent } from "@cocktrail/shared";
import type { OrdersRepository } from "./orders.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";
import { emit } from "../../shared/sse/sse-manager.js";

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

function shortToken(): string {
  return randomBytes(4).toString("hex");
}

export type CreateOrderResult = Order & { printed: boolean };

export class OrdersService {
  constructor(
    private ordersRepo: OrdersRepository,
    private drinksRepo: DrinksRepository,
    private getActiveEvent: () => Promise<NightEvent | null>,
    private incrementOrderCounter: (eventId: string) => Promise<number>,
    private generateTicketCodeString?: (orderId: string) => string,
    private saveTicket?: (orderId: string, code: string) => Promise<void>,
    private printTicket?: (order: Order, nightEvent: NightEvent) => Promise<void>,
  ) {}

  async createOrder(input: NewOrderInput, createdBy?: string): Promise<CreateOrderResult> {
    const event = await this.getActiveEvent();
    if (!event || event.status !== "activo") {
      throw new Conflict("No hay un evento activo. No se pueden crear pedidos.");
    }
    if (input.items.length === 0) {
      throw new BadRequest("El pedido no tiene items.");
    }

    const items = [];
    for (const it of input.items) {
      const drink = await this.drinksRepo.findById(it.drinkId);
      if (!drink) throw new NotFound(`Drink ${it.drinkId} no existe.`);
      if (!drink.available) throw new Conflict(`${drink.name} no está disponible.`);
      if (it.qty <= 0) throw new BadRequest("Cantidad inválida.");
      items.push({
        drinkId: drink.id,
        name: drink.name,
        qty: it.qty,
        unitPrice: drink.price,
        subtotal: drink.price * it.qty,
      });
    }

    const total = items.reduce((sum, it) => sum + it.subtotal, 0);
    const displayNumber = await this.incrementOrderCounter(event.id);

    const order: Order = {
      id: randomUUID(),
      token: shortToken(),
      displayNumber,
      items,
      total,
      paymentMethod: input.paymentMethod,
      status: "pendiente",
      createdAt: Date.now(),
      createdBy: createdBy || "Cliente",
    };

    if (this.generateTicketCodeString) {
      order.ticketCode = this.generateTicketCodeString(order.id);
    }

    await this.ordersRepo.create(order, event.id);

    if (this.saveTicket && order.ticketCode) {
      await this.saveTicket(order.id, order.ticketCode);
    }

    let printed = false;
    const isStaffOrder = Boolean(createdBy && createdBy !== "Cliente");
    if (this.printTicket && isStaffOrder) {
      try {
        await this.printTicket(order, event);
        printed = true;
      } catch {
        printed = false; // red de seguridad extra; printTicket ya no debería nunca tirar
      }
    }

    emit({ type: "order.created", order });
    return { ...order, printed };
  }

  async updateOrderStatus(
    id: string,
    status: OrderStatus,
    operator?: string,
    deliveryMeta?: { deliveredByBar?: string; redeemMethod?: "scan" | "manual" },
  ): Promise<Order> {
    const order = await this.ordersRepo.findById(id);
    if (!order) throw new NotFound(`Order ${id} no existe.`);

    const allowed = STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(status)) {
      throw new Conflict(`Transición inválida: ${order.status} → ${status}.`);
    }

    const timestamps: {
      deliveredAt?: number;
      cancelledAt?: number;
      cancelledBy?: string;
      deliveredBy?: string;
      deliveredByBar?: string;
      redeemMethod?: "scan" | "manual";
    } = {};
    if (status === "entregado") {
      timestamps.deliveredAt = Date.now();
      timestamps.deliveredBy = operator || "desconocido";
      if (deliveryMeta?.deliveredByBar) timestamps.deliveredByBar = deliveryMeta.deliveredByBar;
      if (deliveryMeta?.redeemMethod) timestamps.redeemMethod = deliveryMeta.redeemMethod;
    }
    if (status === "cancelado") {
      timestamps.cancelledAt = Date.now();
      timestamps.cancelledBy = operator || "desconocido";
    }

    const updated = await this.ordersRepo.updateStatus(id, status, timestamps);
    emit({ type: "order.updated", order: updated });
    return updated;
  }

  async getActiveOrders(): Promise<Order[]> {
    const event = await this.getActiveEvent();
    if (!event) return [];
    return this.ordersRepo.findActive(event.id);
  }

  async listOrders(): Promise<Order[]> {
    const event = await this.getActiveEvent();
    if (!event) return [];
    return this.ordersRepo.listForEvent(event.id);
  }

  async getOrdersLog(all: boolean = false): Promise<Order[]> {
    if (all) {
      return this.ordersRepo.listAll();
    }
    const event = await this.getActiveEvent();
    if (!event) return [];
    return this.ordersRepo.listForEvent(event.id);
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return this.ordersRepo.findById(id);
  }

  async getOrderByToken(token: string): Promise<Order | undefined> {
    return this.ordersRepo.findByToken(token);
  }
}
