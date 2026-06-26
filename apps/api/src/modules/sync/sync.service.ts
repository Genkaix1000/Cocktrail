import { supabase, supabaseCloud } from "../../shared/supabase.js";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { CashSalesRepository } from "../cash-sales/cash-sales.repository.js";
import type { NightEvent } from "@cocktrail/shared";

export class SyncService {
  /**
   * Descarga la "Fuente de la Verdad" (usuarios, tragos, config) desde la Nube
   * y la guarda en la base local (Mini-PC).
   */
  async pullMasterData(): Promise<void> {
    if (!supabaseCloud) {
      console.log("[SyncService] No hay conexión a Supabase Cloud configurada. Saltando Pull...");
      return;
    }

    try {
      console.log("[SyncService] 🔄 Iniciando Pull desde Supabase Cloud...");

      // 1. Pull Users
      const { data: users, error: errUsers } = await supabaseCloud.from("users").select("*");
      if (!errUsers && users && users.length > 0) {
        await supabase.from("users").upsert(users);
        console.log(`[SyncService] ✅ Users actualizados: ${users.length}`);
      } else {
        if (errUsers) console.error("[SyncService] Error descargando users:", errUsers.message);
        
        // Check if local users is empty
        const { data: localUsers } = await supabase.from("users").select("id").limit(1);
        if (!localUsers || localUsers.length === 0) {
          console.log("[SyncService] No users found anywhere. Seeding default admin locally.");
          const { randomUUID, createHash } = await import("node:crypto");
          const { env } = await import("../../config/env.js");
          const passHash = createHash("sha256").update(env.ADMIN_PASS).digest("hex");
          await supabase.from("users").insert({
            id: randomUUID(),
            username: env.ADMIN_USER,
            password_hash: passHash,
            role: "admin",
            permissions: {
              closeNight: true, modifyCarta: true, manageUsers: true, monitoreo: true, 
              metricas: true, historial: true, general: true, carta: true, pagos: true, 
              staff: true, cancelarTickets: true
            },
            created_at: new Date().toISOString()
          });
        }
      }

      // 2. Pull Drinks
      const { data: drinks, error: errDrinks } = await supabaseCloud.from("drinks").select("*");
      if (!errDrinks && drinks && drinks.length > 0) {
        await supabase.from("drinks").upsert(drinks);
        console.log(`[SyncService] ✅ Drinks actualizados: ${drinks.length}`);
      } else {
        if (errDrinks) console.error("[SyncService] Error descargando drinks:", errDrinks.message);
        
        // Check if local drinks is empty
        const { data: localDrinks } = await supabase.from("drinks").select("id").limit(1);
        if (!localDrinks || localDrinks.length === 0) {
          console.log("[SyncService] No drinks found anywhere. Seeding default drinks locally.");
          const { SEED_DRINKS } = await import("../../data/drinks.js");
          const drinksToInsert = SEED_DRINKS.map(d => ({
            id: d.id,
            name: d.name,
            price: d.price,
            description: d.description,
            vibe: d.vibe,
            flavors: d.flavors,
            icon_name: d.iconName,
            image: d.image || null,
            trending: d.trending,
            promo: d.promo || false,
            available: d.available
          }));
          await supabase.from("drinks").insert(drinksToInsert);
        }
      }



      console.log("[SyncService] 🎯 Pull completado con éxito.");
    } catch (error) {
      console.error("[SyncService] ❌ Falló el Pull Master Data:", error);
    }
  }

  /**
   * Garantiza que los datos maestros locales (admin predeterminado, tragos iniciales) estén en la base de datos local
   * sin necesidad de conectarse a Supabase Cloud en el arranque.
   */
  async ensureLocalMasterDataSeeded(): Promise<void> {
    try {
      // 1. Seed Users if empty
      const { data: localUsers, error: errUsers } = await supabase.from("users").select("id").limit(1);
      if (!errUsers && (!localUsers || localUsers.length === 0)) {
        console.log("[SyncService] No users found locally. Seeding default admin...");
        const { randomUUID, createHash } = await import("node:crypto");
        const { env } = await import("../../config/env.js");
        const passHash = createHash("sha256").update(env.ADMIN_PASS).digest("hex");
        await supabase.from("users").insert({
          id: randomUUID(),
          username: env.ADMIN_USER,
          password_hash: passHash,
          role: "admin",
          permissions: {
            closeNight: true, modifyCarta: true, manageUsers: true, monitoreo: true, 
            metricas: true, historial: true, general: true, carta: true, pagos: true, 
            staff: true, cancelarTickets: true
          },
          created_at: new Date().toISOString()
        });
        console.log("[SyncService] Default admin seeded locally.");
      }

      // 2. Seed Drinks if empty
      const { data: localDrinks, error: errDrinks } = await supabase.from("drinks").select("id").limit(1);
      if (!errDrinks && (!localDrinks || localDrinks.length === 0)) {
        console.log("[SyncService] No drinks found locally. Seeding default drinks...");
        const { SEED_DRINKS } = await import("../../data/drinks.js");
        const drinksToInsert = SEED_DRINKS.map(d => ({
          id: d.id,
          name: d.name,
          price: d.price,
          description: d.description,
          vibe: d.vibe,
          flavors: d.flavors,
          icon_name: d.iconName,
          image: d.image || null,
          trending: d.trending,
          promo: d.promo || false,
          available: d.available
        }));
        await supabase.from("drinks").insert(drinksToInsert);
        console.log("[SyncService] Default drinks seeded locally.");
      }
    } catch (err: any) {
      console.error("[SyncService] ❌ Failed to ensure local master data is seeded:", err.message || err);
    }
  }

  /**
   * Sube toda la información transaccional de una noche desde la caja local a la Nube.
   * Incluye el evento en sí, todos los pedidos, tickets y cierres parciales de caja.
   */
  async pushEventData(eventId: string, event: NightEvent, eventTotals: any): Promise<void> {
    if (!supabaseCloud) {
      console.log("[SyncService] No hay conexión a Supabase Cloud configurada. Saltando Push...");
      return;
    }

    try {
      console.log(`[SyncService] ⬆️ Iniciando Push a Supabase Cloud para evento ${eventId}...`);

      // 1. Marcar como 'pending' localmente
      await supabase.from("night_events").update({ sync_status: "pending" }).eq("id", eventId);

      // 2. Subir Night Event con totales (sin status ya que la tabla cloud de historial no contiene esa columna)
      const eventRecord = {
        id: event.id,
        started_at: new Date(event.startedAt).toISOString(),
        closed_at: event.closedAt ? new Date(event.closedAt).toISOString() : null,
        order_counter: event.orderCounter,
        totals: eventTotals,
      };

      const { error: errEvent } = await supabaseCloud.from("night_events").upsert(eventRecord);
      if (errEvent) throw errEvent;

      // 3. Obtener y subir Orders
      const { data: orders, error: errOrdersFetch } = await supabase.from("orders").select("*").eq("event_id", eventId);
      if (errOrdersFetch) throw errOrdersFetch;
      if (orders && orders.length > 0) {
        const { error: errOrdersUpsert } = await supabaseCloud.from("orders").upsert(orders);
        if (errOrdersUpsert) throw errOrdersUpsert;
      }

      // 4. Obtener y subir Tickets correspondientes a esos orders
      if (orders && orders.length > 0) {
        const orderIds = orders.map((o: any) => o.id);
        const { data: tickets, error: errTicketsFetch } = await supabase.from("tickets").select("*").in("order_id", orderIds);
        if (errTicketsFetch) throw errTicketsFetch;
        
        if (tickets && tickets.length > 0) {
          const { error: errTicketsUpsert } = await supabaseCloud.from("tickets").upsert(tickets);
          if (errTicketsUpsert) throw errTicketsUpsert;
        }
      }

      // 5. Obtener y subir Cash Sales
      const { data: cashSales, error: errCashSalesFetch } = await supabase.from("cash_sales").select("*").eq("event_id", eventId);
      if (errCashSalesFetch) throw errCashSalesFetch;
      if (cashSales && cashSales.length > 0) {
        const { error: errCashSalesUpsert } = await supabaseCloud.from("cash_sales").upsert(cashSales);
        if (errCashSalesUpsert) throw errCashSalesUpsert;
      }

      // 6. Marcar como sincronizado localmente
      await supabase
        .from("night_events")
        .update({ sync_status: "synced", synced_at: new Date().toISOString() })
        .eq("id", eventId);

      console.log(`[SyncService] ☁️✅ Evento ${eventId} subido a la nube correctamente.`);
    } catch (error) {
      console.error(`[SyncService] ❌ Falló la sincronización a la nube del evento ${eventId}:`, error);
      
      // Marcar como fallido
      await supabase
        .from("night_events")
        .update({ sync_status: "failed" })
        .eq("id", eventId);
    }
  }

  async syncAllPendingEvents(ordersRepo: OrdersRepository, cashSalesRepo: CashSalesRepository): Promise<{ successCount: number; failedCount: number }> {
    if (!supabaseCloud) {
      throw new Error("No cloud DB configured");
    }

    const { data: pendingEvents, error } = await supabase
      .from("night_events")
      .select("*")
      .eq("status", "cerrado")
      .neq("sync_status", "synced");

    if (error) throw error;
    if (!pendingEvents || pendingEvents.length === 0) {
      return { successCount: 0, failedCount: 0 };
    }

    let successCount = 0;
    let failedCount = 0;

    for (const row of pendingEvents) {
      try {
        const eventId = row.id;
        const event: NightEvent = {
          id: row.id,
          status: row.status,
          startedAt: new Date(row.started_at).getTime(),
          closedAt: row.closed_at ? new Date(row.closed_at).getTime() : undefined,
          orderCounter: row.order_counter,
        };

        const orders = await ordersRepo.listForEvent(eventId);
        const cashSales = await cashSalesRepo.listForEvent(eventId);
        const { computeTotals } = await import("../../shared/utils/totals.js");
        const totals = computeTotals(orders, cashSales);

        await this.pushEventData(eventId, event, totals);
        
        // Re-check sync status locally to ensure it successfully marked as synced
        const { data: updated } = await supabase.from("night_events").select("sync_status").eq("id", eventId).single();
        if (updated && updated.sync_status === "synced") {
          successCount++;
        } else {
          failedCount++;
        }
      } catch (err) {
        console.error(`[SyncService] Error manually syncing event ${row.id}:`, err);
        failedCount++;
      }
    }

    return { successCount, failedCount };
  }
}

export const syncService = new SyncService();
