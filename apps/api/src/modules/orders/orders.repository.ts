import fs from "node:fs";
import path from "node:path";
import type { Order, OrderStatus } from "@cocktrail/shared";

// ── Interface (contrato) ──

export interface OrdersRepository {
  create(order: Order): Order;
  findById(id: string): Order | undefined;
  findByToken(token: string): Order | undefined;
  findActive(): Order[];
  list(): Order[];
  updateStatus(
    id: string,
    status: OrderStatus,
    timestamps?: {
      readyAt?: number;
      deliveredAt?: number;
      cancelledAt?: number;
      cancelledBy?: string;
      deliveredBy?: string;
      deliveredByBar?: string;
      redeemMethod?: "scan" | "manual";
    },
  ): Order;
  clear(): void;
}

// ── Helpers para Log de Auditoría Persistente ──

const DATA_DIR = path.resolve(
  new URL(".", import.meta.url).pathname,
  "../../data",
);
const LOG_FILE = path.join(DATA_DIR, "orders-log.json");

function logOrder(order: Order) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    let logs: Order[] = [];
    if (fs.existsSync(LOG_FILE)) {
      const raw = fs.readFileSync(LOG_FILE, "utf-8");
      logs = JSON.parse(raw);
    }
    const idx = logs.findIndex((o) => o.id === order.id);
    if (idx !== -1) {
      logs[idx] = order;
    } else {
      logs.push(order);
    }
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), "utf-8");
  } catch (err) {
    console.error("[OrdersLog] Error logging order:", err);
  }
}

export function getOrdersLog(): Order[] {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const raw = fs.readFileSync(LOG_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("[OrdersLog] Error reading orders-log.json:", err);
  }
  return [];
}

// ── Implementación In-Memory (fase 1) ──

export class InMemoryOrdersRepository implements OrdersRepository {
  private orders = new Map<string, Order>();

  create(order: Order): Order {
    this.orders.set(order.id, order);
    logOrder(order);
    return order;
  }

  findById(id: string): Order | undefined {
    const active = this.orders.get(id);
    if (active) return active;

    const logs = getOrdersLog();
    return logs.find((o) => o.id === id);
  }

  findByToken(token: string): Order | undefined {
    for (const order of this.orders.values()) {
      if (order.token === token) return order;
    }
    const logs = getOrdersLog();
    return logs.find((o) => o.token === token);
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
    timestamps?: {
      readyAt?: number;
      deliveredAt?: number;
      cancelledAt?: number;
      cancelledBy?: string;
      deliveredBy?: string;
      deliveredByBar?: string;
      redeemMethod?: "scan" | "manual";
    },
  ): Order {
    const order = this.orders.get(id);
    if (!order) {
      // Si la orden no está en memoria pero sí está en los logs
      const logs = getOrdersLog();
      const loggedOrder = logs.find((o) => o.id === id);
      if (loggedOrder) {
        loggedOrder.status = status;
        if (timestamps?.readyAt) loggedOrder.readyAt = timestamps.readyAt;
        if (timestamps?.deliveredAt) loggedOrder.deliveredAt = timestamps.deliveredAt;
        if (timestamps?.cancelledAt) loggedOrder.cancelledAt = timestamps.cancelledAt;
        if (timestamps?.cancelledBy) loggedOrder.cancelledBy = timestamps.cancelledBy;
        if (timestamps?.deliveredBy) loggedOrder.deliveredBy = timestamps.deliveredBy;
        if (timestamps?.deliveredByBar) loggedOrder.deliveredByBar = timestamps.deliveredByBar;
        if (timestamps?.redeemMethod) loggedOrder.redeemMethod = timestamps.redeemMethod;

        // Persistir el cambio
        try {
          fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), "utf-8");
        } catch (err) {
          console.error("[OrdersLog] Error updating logged order:", err);
        }
        return loggedOrder;
      }
      throw new Error(`Order ${id} not found in repository or log`);
    }

    order.status = status;
    if (timestamps?.readyAt) order.readyAt = timestamps.readyAt;
    if (timestamps?.deliveredAt) order.deliveredAt = timestamps.deliveredAt;
    if (timestamps?.cancelledAt) order.cancelledAt = timestamps.cancelledAt;
    if (timestamps?.cancelledBy) order.cancelledBy = timestamps.cancelledBy;
    if (timestamps?.deliveredBy) order.deliveredBy = timestamps.deliveredBy;
    if (timestamps?.deliveredByBar) order.deliveredByBar = timestamps.deliveredByBar;
    if (timestamps?.redeemMethod) order.redeemMethod = timestamps.redeemMethod;

    logOrder(order);
    return order;
  }

  clear(): void {
    this.orders.clear();
  }
}
