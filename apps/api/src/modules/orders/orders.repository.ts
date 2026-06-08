import type { Order, OrderStatus } from "@cocktrail/shared";

// ── Interface (contrato) ──

export interface OrdersRepository {
  create(order: Order): Order;
  findById(id: string): Order | undefined;
  findByToken(token: string): Order | undefined;
  findActive(): Order[];
  list(): Order[];
  updateStatus(id: string, status: OrderStatus, timestamps?: { readyAt?: number; deliveredAt?: number }): Order;
  clear(): void;
}

// ── Implementación In-Memory (fase 1) ──

export class InMemoryOrdersRepository implements OrdersRepository {
  private orders = new Map<string, Order>();

  create(order: Order): Order {
    this.orders.set(order.id, order);
    return order;
  }

  findById(id: string): Order | undefined {
    return this.orders.get(id);
  }

  findByToken(token: string): Order | undefined {
    for (const order of this.orders.values()) {
      if (order.token === token) return order;
    }
    return undefined;
  }

  findActive(): Order[] {
    return Array.from(this.orders.values())
      .filter((o) => o.status !== "entregado" && o.status !== "cancelado")
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  list(): Order[] {
    return Array.from(this.orders.values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  }

  updateStatus(
    id: string,
    status: OrderStatus,
    timestamps?: { readyAt?: number; deliveredAt?: number },
  ): Order {
    const order = this.orders.get(id);
    if (!order) throw new Error(`Order ${id} not found in repository`);
    order.status = status;
    if (timestamps?.readyAt) order.readyAt = timestamps.readyAt;
    if (timestamps?.deliveredAt) order.deliveredAt = timestamps.deliveredAt;
    return order;
  }

  clear(): void {
    this.orders.clear();
  }
}
