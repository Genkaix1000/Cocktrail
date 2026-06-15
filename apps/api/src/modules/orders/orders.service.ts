import { randomBytes, randomUUID } from "node:crypto";
import type { NewOrderInput, Order, OrderStatus } from "@cocktrail/shared";
import { type OrdersRepository, getOrdersLog } from "./orders.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";
import { emit } from "../../shared/sse/sse-manager.js";

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pagado: ["preparando", "cancelado"],
  preparando: ["listo", "cancelado"],
  listo: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

function shortToken(): string {
  return randomBytes(4).toString("hex");
}

export class OrdersService {
  constructor(
    private ordersRepo: OrdersRepository,
    private drinksRepo: DrinksRepository,
    private getEventStatus: () => string,
    private incrementOrderCounter: () => number,
    private generateTicketCode?: (orderId: string) => string,
  ) {}

  createOrder(input: NewOrderInput, createdBy?: string): Order {
    if (this.getEventStatus() !== "activo") {
      throw new Conflict("No hay un evento activo. No se pueden crear pedidos.");
    }
    if (input.items.length === 0) {
      throw new BadRequest("El pedido no tiene items.");
    }

    const items = input.items.map((it) => {
      const drink = this.drinksRepo.findById(it.drinkId);
      if (!drink) throw new NotFound(`Drink ${it.drinkId} no existe.`);
      if (!drink.available) throw new Conflict(`${drink.name} no está disponible.`);
      if (it.qty <= 0) throw new BadRequest("Cantidad inválida.");
      return {
        drinkId: drink.id,
        name: drink.name,
        qty: it.qty,
        unitPrice: drink.price,
        subtotal: drink.price * it.qty,
      };
    });

    const total = items.reduce((sum, it) => sum + it.subtotal, 0);
    const displayNumber = this.incrementOrderCounter();

    const order: Order = {
      id: randomUUID(),
      token: shortToken(),
      displayNumber,
      items,
      total,
      paymentMethod: input.paymentMethod,
      status: "pagado",
      createdAt: Date.now(),
      createdBy: createdBy || "Cliente",
    };

    if (this.generateTicketCode) {
      order.ticketCode = this.generateTicketCode(order.id);
    }

    this.ordersRepo.create(order);
    emit({ type: "order.created", order });
    return order;
  }

  updateOrderStatus(
    id: string,
    status: OrderStatus,
    operator?: string,
    deliveryMeta?: { deliveredByBar?: string; redeemMethod?: "scan" | "manual" },
  ): Order {
    const order = this.ordersRepo.findById(id);
    if (!order) throw new NotFound(`Order ${id} no existe.`);

    const allowed = STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(status)) {
      throw new Conflict(`Transición inválida: ${order.status} → ${status}.`);
    }

    const timestamps: {
      readyAt?: number;
      deliveredAt?: number;
      cancelledAt?: number;
      cancelledBy?: string;
      deliveredBy?: string;
      deliveredByBar?: string;
      redeemMethod?: "scan" | "manual";
    } = {};
    if (status === "listo") timestamps.readyAt = Date.now();
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

    const updated = this.ordersRepo.updateStatus(id, status, timestamps);
    emit({ type: "order.updated", order: updated });
    return updated;
  }

  getActiveOrders(): Order[] {
    return this.ordersRepo.findActive();
  }

  listOrders(): Order[] {
    return this.ordersRepo.list();
  }

  getOrdersLog(): Order[] {
    return getOrdersLog();
  }

  getOrder(id: string): Order | undefined {
    return this.ordersRepo.findById(id);
  }

  getOrderByToken(token: string): Order | undefined {
    return this.ordersRepo.findByToken(token);
  }
}
