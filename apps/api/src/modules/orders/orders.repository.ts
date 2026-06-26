import type { Order, OrderStatus } from "@cocktrail/shared";
import { supabase } from "../../shared/supabase.js";

// ── Interface (contrato) ──

export interface OrdersRepository {
  create(order: Order, eventId: string): Promise<Order>;
  findById(id: string): Promise<Order | undefined>;
  findByToken(token: string): Promise<Order | undefined>;
  findActive(eventId: string): Promise<Order[]>;
  listForEvent(eventId: string): Promise<Order[]>;
  listAll(): Promise<Order[]>;
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
  ): Promise<Order>;
  clear(): Promise<void>;
}

// ── Implementación In-Memory (async) ──

export class InMemoryOrdersRepository implements OrdersRepository {
  private orders = new Map<string, { order: Order; eventId: string }>();

  async create(order: Order, eventId: string): Promise<Order> {
    this.orders.set(order.id, { order, eventId });
    return order;
  }

  async findById(id: string): Promise<Order | undefined> {
    const entry = this.orders.get(id);
    return entry ? entry.order : undefined;
  }

  async findByToken(token: string): Promise<Order | undefined> {
    for (const entry of this.orders.values()) {
      if (entry.order.token === token) return entry.order;
    }
    return undefined;
  }

  async findActive(eventId: string): Promise<Order[]> {
    return Array.from(this.orders.values())
      .filter((entry) => entry.eventId === eventId)
      .map((entry) => entry.order)
      .filter((o) => o.status !== "entregado" && o.status !== "cancelado")
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async listForEvent(eventId: string): Promise<Order[]> {
    return Array.from(this.orders.values())
      .filter((entry) => entry.eventId === eventId)
      .map((entry) => entry.order)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async listAll(): Promise<Order[]> {
    return Array.from(this.orders.values())
      .map((entry) => entry.order)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async updateStatus(
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
  ): Promise<Order> {
    const entry = this.orders.get(id);
    if (!entry) {
      throw new Error(`Order ${id} not found in memory`);
    }

    const { order } = entry;
    order.status = status;
    if (timestamps?.readyAt) order.readyAt = timestamps.readyAt;
    if (timestamps?.deliveredAt) order.deliveredAt = timestamps.deliveredAt;
    if (timestamps?.cancelledAt) order.cancelledAt = timestamps.cancelledAt;
    if (timestamps?.cancelledBy) order.cancelledBy = timestamps.cancelledBy;
    if (timestamps?.deliveredBy) order.deliveredBy = timestamps.deliveredBy;
    if (timestamps?.deliveredByBar) order.deliveredByBar = timestamps.deliveredByBar;
    if (timestamps?.redeemMethod) order.redeemMethod = timestamps.redeemMethod;

    return order;
  }

  async clear(): Promise<void> {
    this.orders.clear();
  }
}

// ── Implementación Supabase ──

function mapRowToOrder(row: any): Order {
  return {
    id: row.id,
    token: row.token,
    displayNumber: row.display_number,
    items: row.items,
    total: row.total,
    paymentMethod: row.payment_method,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
    readyAt: row.ready_at ? new Date(row.ready_at).getTime() : undefined,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at).getTime() : undefined,
    ticketCode: row.ticket_code || undefined,
    createdBy: row.created_by || undefined,
    cancelledBy: row.cancelled_by || undefined,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).getTime() : undefined,
    deliveredBy: row.delivered_by || undefined,
    deliveredByBar: row.delivered_by_bar || undefined,
    redeemMethod: row.redeem_method || undefined,
  };
}

export class SupabaseOrdersRepository implements OrdersRepository {
  async create(order: Order, eventId: string): Promise<Order> {
    const { data, error } = await supabase
      .from("orders")
      .insert({
        id: order.id,
        event_id: eventId,
        token: order.token,
        display_number: order.displayNumber,
        items: order.items,
        total: order.total,
        payment_method: order.paymentMethod,
        status: order.status,
        created_at: new Date(order.createdAt).toISOString(),
        ticket_code: order.ticketCode || null,
        created_by: order.createdBy || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[SupabaseOrdersRepository] Error creating order:", error);
      throw error;
    }

    return mapRowToOrder(data);
  }

  async findById(id: string): Promise<Order | undefined> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseOrdersRepository] Error finding order by id:", error);
      throw error;
    }

    return data ? mapRowToOrder(data) : undefined;
  }

  async findByToken(token: string): Promise<Order | undefined> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseOrdersRepository] Error finding order by token:", error);
      throw error;
    }

    return data ? mapRowToOrder(data) : undefined;
  }

  async findActive(eventId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("event_id", eventId)
      .not("status", "in", '("entregado","cancelado")')
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[SupabaseOrdersRepository] Error listing active orders:", error);
      throw error;
    }

    return data.map(mapRowToOrder);
  }

  async listForEvent(eventId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[SupabaseOrdersRepository] Error listing event orders:", error);
      throw error;
    }

    return data.map(mapRowToOrder);
  }

  async listAll(): Promise<Order[]> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[SupabaseOrdersRepository] Error listing all orders:", error);
      throw error;
    }

    return data.map(mapRowToOrder);
  }

  async updateStatus(
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
  ): Promise<Order> {
    const updates: any = { status };
    if (timestamps?.readyAt) updates.ready_at = new Date(timestamps.readyAt).toISOString();
    if (timestamps?.deliveredAt) updates.delivered_at = new Date(timestamps.deliveredAt).toISOString();
    if (timestamps?.cancelledAt) updates.cancelled_at = new Date(timestamps.cancelledAt).toISOString();
    if (timestamps?.cancelledBy) updates.cancelled_by = timestamps.cancelledBy;
    if (timestamps?.deliveredBy) updates.delivered_by = timestamps.deliveredBy;
    if (timestamps?.deliveredByBar) updates.delivered_by_bar = timestamps.deliveredByBar;
    if (timestamps?.redeemMethod) updates.redeem_method = timestamps.redeemMethod;

    const { data, error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[SupabaseOrdersRepository] Error updating order status:", error);
      throw error;
    }

    return mapRowToOrder(data);
  }

  async clear(): Promise<void> {
    // In SQL context, we preserve records.
  }
}
