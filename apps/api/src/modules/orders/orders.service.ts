import { randomBytes, randomUUID } from "node:crypto";
import type { NewOrderInput, Order, OrderStatus, NightEvent } from "@cocktrail/shared";
import type { OrdersRepository } from "./orders.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";
import type { EmitFn } from "../../shared/sse/sse-manager.js";

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
    private emit: EmitFn,
    private generateTicketCodeString?: (orderId: string) => string,
    private saveTicket?: (orderId: string, code: string) => Promise<void>,
    private printTicket?: (order: Order, nightEvent: NightEvent) => Promise<void>,
  ) {}

  async createOrder(input: NewOrderInput, createdBy?: string): Promise<CreateOrderResult> {
    const event = await this.getActiveEvent();
    if (!event || event.status !== "activo") {
      throw new Conflict("Todavía no se abrió la noche. Pedile al admin que la abra desde /admin para poder cobrar.");
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

    this.emit({ type: "order.created", order });
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

    // `expectedStatus: order.status` hace el UPDATE atómico ante una transición concurrente
    // (ej. canje + cancelación del mismo pedido casi al mismo tiempo) — si otra request ya
    // cambió el status entre el findById de arriba y este UPDATE, la condición no matchea y
    // undefined nos avisa que perdimos la carrera, en vez de pisar el resultado del ganador.
    const updated = await this.ordersRepo.updateStatus(id, status, timestamps, order.status);
    if (!updated) {
      const current = await this.ordersRepo.findById(id);
      throw new Conflict(
        `Transición inválida: ${current?.status ?? "desconocido"} → ${status} (el pedido cambió de estado durante la operación).`,
      );
    }
    this.emit({ type: "order.updated", order: updated });
    return updated;
  }

  /**
   * Intención "entregar este pedido" para el flujo de canje de ticket (/barra), sin que el
   * caller (TicketsService) necesite conocer el literal "entregado" ni la máquina de estados
   * interna. Wrapper delgado sobre updateOrderStatus — la atomicidad (UPDATE condicionado a
   * status="pendiente") es exactamente la misma, solo cambia quién arma los parámetros. Ver
   * docs/specs/02-auditoria-api/deuda-estructural-fase2.md (punto 5) y docs/specs/deuda-pre-fase-6/atomicidad-canje-ticket.md.
   */
  async markDelivered(
    orderId: string,
    operator: string,
    meta?: { deliveredByBar?: string; redeemMethod?: "scan" | "manual" },
  ): Promise<Order> {
    const order = await this.ordersRepo.findById(orderId);
    if (!order) throw new NotFound(`Order ${orderId} no existe.`);
    if (order.status !== "pendiente") {
      throw new Conflict(`El pedido está en un estado (${order.status}) que no se puede entregar.`);
    }
    return this.updateOrderStatus(orderId, "entregado", operator, meta);
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
