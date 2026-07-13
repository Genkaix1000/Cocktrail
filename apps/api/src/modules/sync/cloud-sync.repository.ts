import { supabase, supabaseCloud } from "../../shared/supabase.js";
import type { CashSale, EventTotals, NightEvent, Order } from "@cocktrail/shared";
import type { Ticket } from "../tickets/tickets.repository.js";

/**
 * Concentra TODO el acceso directo a `supabaseCloud`/`supabase` que necesita el sync
 * local↔cloud — la única parte de `SyncService` que legítimamente no puede modelarse con
 * los repos locales ya auditados (dirección de lectura opuesta para pull, bulk-upsert de
 * filas ya existentes para push, upsert de filas ya-en-forma-cloud sin semántica de
 * dominio para la escritura local del pull). Ver docs/specs/deuda-estructural-fase2.md
 * (punto 2) y la nota del agente `supabase-expert` de esa sesión.
 */
export interface CloudSyncRepository {
  isConfigured(): boolean;
  /** Descarga `users` de cloud y hace upsert local (mismo esquema, sin mapeo de dominio). */
  pullUsers(): Promise<{ count: number }>;
  /** Descarga `drinks` de cloud y hace upsert local. */
  pullDrinks(): Promise<{ count: number }>;
  pushNightEvent(event: NightEvent, totals: EventTotals): Promise<void>;
  pushOrders(eventId: string, orders: Order[]): Promise<void>;
  pushTickets(tickets: Ticket[]): Promise<void>;
  pushCashSales(eventId: string, cashSales: CashSale[]): Promise<void>;
}

export class SupabaseCloudSyncRepository implements CloudSyncRepository {
  isConfigured(): boolean {
    return !!supabaseCloud;
  }

  async pullUsers(): Promise<{ count: number }> {
    if (!supabaseCloud) return { count: 0 };
    const { data, error } = await supabaseCloud.from("users").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error descargando users:", error.message);
      return { count: 0 };
    }
    if (!data || data.length === 0) return { count: 0 };
    const { error: upsertError } = await supabase.from("users").upsert(data);
    if (upsertError) {
      // No propagar count>0 si el upsert LOCAL falló — si no, el caller (pullMasterData)
      // cree que ya sincronizó bien y ni loguea el error de verdad ni cae al fallback de
      // seed. Este bug real dejó la tabla local de drinks vacía en silencio (ver
      // docs/ROADMAP.md, fix 2026-07-13) hasta el próximo sync manual.
      console.error("[SupabaseCloudSyncRepository] Error escribiendo users en local (upsert):", upsertError.message);
      return { count: 0 };
    }
    return { count: data.length };
  }

  async pullDrinks(): Promise<{ count: number }> {
    if (!supabaseCloud) return { count: 0 };
    const { data, error } = await supabaseCloud.from("drinks").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error descargando drinks:", error.message);
      return { count: 0 };
    }
    if (!data || data.length === 0) return { count: 0 };
    const { error: upsertError } = await supabase.from("drinks").upsert(data);
    if (upsertError) {
      console.error("[SupabaseCloudSyncRepository] Error escribiendo drinks en local (upsert):", upsertError.message);
      return { count: 0 };
    }
    return { count: data.length };
  }

  async pushNightEvent(event: NightEvent, totals: EventTotals): Promise<void> {
    if (!supabaseCloud) return;
    // Sin `status`: la tabla cloud de historial no tiene esa columna.
    const eventRecord = {
      id: event.id,
      started_at: new Date(event.startedAt).toISOString(),
      closed_at: event.closedAt ? new Date(event.closedAt).toISOString() : null,
      order_counter: event.orderCounter,
      totals,
    };
    const { error } = await supabaseCloud.from("night_events").upsert(eventRecord);
    if (error) throw error;
  }

  async pushOrders(eventId: string, orders: Order[]): Promise<void> {
    if (!supabaseCloud || orders.length === 0) return;
    const rows = orders.map((o) => ({
      id: o.id,
      event_id: eventId,
      token: o.token,
      display_number: o.displayNumber,
      items: o.items,
      total: o.total,
      payment_method: o.paymentMethod,
      status: o.status,
      created_at: new Date(o.createdAt).toISOString(),
      ready_at: o.readyAt ? new Date(o.readyAt).toISOString() : null,
      delivered_at: o.deliveredAt ? new Date(o.deliveredAt).toISOString() : null,
      ticket_code: o.ticketCode || null,
      created_by: o.createdBy || null,
      cancelled_by: o.cancelledBy || null,
      cancelled_at: o.cancelledAt ? new Date(o.cancelledAt).toISOString() : null,
      delivered_by: o.deliveredBy || null,
      delivered_by_bar: o.deliveredByBar || null,
      redeem_method: o.redeemMethod || null,
    }));
    const { error } = await supabaseCloud.from("orders").upsert(rows);
    if (error) throw error;
  }

  async pushTickets(tickets: Ticket[]): Promise<void> {
    if (!supabaseCloud || tickets.length === 0) return;
    const rows = tickets.map((t) => ({
      id: t.id,
      order_id: t.orderId,
      code: t.code,
      created_at: new Date(t.createdAt).toISOString(),
      redeemed_at: t.redeemedAt ? new Date(t.redeemedAt).toISOString() : null,
      redeemed_by: t.redeemedBy || null,
      redeemed_by_bar: t.redeemedByBar || null,
      redeem_method: t.redeemMethod || null,
    }));
    const { error } = await supabaseCloud.from("tickets").upsert(rows);
    if (error) throw error;
  }

  async pushCashSales(eventId: string, cashSales: CashSale[]): Promise<void> {
    if (!supabaseCloud || cashSales.length === 0) return;
    const rows = cashSales.map((c) => ({
      id: c.id,
      event_id: eventId,
      amount: c.amount,
      description: c.description,
      added_by: c.addedBy,
      created_at: new Date(c.createdAt).toISOString(),
    }));
    const { error } = await supabaseCloud.from("cash_sales").upsert(rows);
    if (error) throw error;
  }
}
