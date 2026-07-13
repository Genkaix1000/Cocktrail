import { randomUUID, createHash } from "node:crypto";
import type { UsersRepository } from "../users/users.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { CashSalesRepository } from "../cash-sales/cash-sales.repository.js";
import type { TicketsRepository } from "../tickets/tickets.repository.js";
import type { EventsRepository } from "../events/events.repository.js";
import type { CloudSyncRepository } from "./cloud-sync.repository.js";
import type { EventTotals, NightEvent } from "@cocktrail/shared";
import { computeTotals } from "../../shared/utils/totals.js";
import { supabase } from "../../shared/supabase.js";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export class SyncService {
  constructor(
    private usersRepo: UsersRepository,
    private drinksRepo: DrinksRepository,
    private ordersRepo: OrdersRepository,
    private cashSalesRepo: CashSalesRepository,
    private ticketsRepo: TicketsRepository,
    private eventsRepo: EventsRepository,
    private cloudSyncRepo: CloudSyncRepository,
  ) {}

  /**
   * Siembra el admin/tragos por defecto LOCAL-ONLY (sin pasar por
   * usersRepo.create()/drinksRepo.create()) — esos métodos hacen dual-write a cloud si
   * `supabaseCloud` está configurado, y este seed de datos demo nunca debe empujarse a
   * cloud (comportamiento preexistente, preservado a propósito — ver pregunta abierta 1
   * de docs/specs/deuda-estructural-fase2.md). Usa el cliente local directo por eso, no
   * es una excepción al espíritu de "reusar repos": es la escritura, no la lectura, la
   * que necesita evitar el side-effect de dual-write.
   */
  private async seedDefaultAdminIfMissing(): Promise<void> {
    const { env } = await import("../../config/env.js");
    const passHash = hashPassword(env.ADMIN_PASS);
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

  private async seedDefaultDrinksIfMissing(): Promise<void> {
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

  /**
   * Descarga la "Fuente de la Verdad" (usuarios, tragos, config) desde la Nube
   * y la guarda en la base local (Mini-PC).
   */
  async pullMasterData(): Promise<void> {
    if (!this.cloudSyncRepo.isConfigured()) {
      console.log("[SyncService] No hay conexión a Supabase Cloud configurada. Saltando Pull...");
      return;
    }

    try {
      console.log("[SyncService] 🔄 Iniciando Pull desde Supabase Cloud...");

      // 1. Pull Users
      const { count: usersCount } = await this.cloudSyncRepo.pullUsers();
      if (usersCount > 0) {
        console.log(`[SyncService] ✅ Users actualizados: ${usersCount}`);
      } else {
        const localUsers = await this.usersRepo.list();
        if (localUsers.length === 0) {
          console.log("[SyncService] No users found anywhere. Seeding default admin locally.");
          await this.seedDefaultAdminIfMissing();
        }
      }

      // 2. Pull Drinks
      const { count: drinksCount } = await this.cloudSyncRepo.pullDrinks();
      if (drinksCount > 0) {
        console.log(`[SyncService] ✅ Drinks actualizados: ${drinksCount}`);
      } else {
        const localDrinks = await this.drinksRepo.list();
        if (localDrinks.length === 0) {
          console.log("[SyncService] No drinks found anywhere. Seeding default drinks locally.");
          await this.seedDefaultDrinksIfMissing();
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
      const localUsers = await this.usersRepo.list();
      if (localUsers.length === 0) {
        console.log("[SyncService] No users found locally. Seeding default admin...");
        await this.seedDefaultAdminIfMissing();
        console.log("[SyncService] Default admin seeded locally.");
      }

      const localDrinks = await this.drinksRepo.list();
      if (localDrinks.length === 0) {
        console.log("[SyncService] No drinks found locally. Seeding default drinks...");
        await this.seedDefaultDrinksIfMissing();
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
  /** Devuelve `true` si el evento terminó `synced`, `false` si falló o no había cloud configurada. */
  async pushEventData(eventId: string, event: NightEvent, eventTotals: EventTotals): Promise<boolean> {
    if (!this.cloudSyncRepo.isConfigured()) {
      console.log("[SyncService] No hay conexión a Supabase Cloud configurada. Saltando Push...");
      return false;
    }

    try {
      console.log(`[SyncService] ⬆️ Iniciando Push a Supabase Cloud para evento ${eventId}...`);

      // 1. Marcar como 'pending' localmente
      await this.eventsRepo.updateSyncStatus(eventId, "pending");

      // 2. Subir Night Event con totales
      await this.cloudSyncRepo.pushNightEvent(event, eventTotals);

      // 3. Obtener y subir Orders
      const orders = await this.ordersRepo.listForEvent(eventId);
      await this.cloudSyncRepo.pushOrders(eventId, orders);

      // 4. Obtener y subir Tickets correspondientes a esos orders
      if (orders.length > 0) {
        const tickets = await this.ticketsRepo.listByOrderIds(orders.map((o) => o.id));
        await this.cloudSyncRepo.pushTickets(tickets);
      }

      // 5. Obtener y subir Cash Sales
      const cashSales = await this.cashSalesRepo.listForEvent(eventId);
      await this.cloudSyncRepo.pushCashSales(eventId, cashSales);

      // 6. Marcar como sincronizado localmente
      await this.eventsRepo.updateSyncStatus(eventId, "synced", Date.now());

      console.log(`[SyncService] ☁️✅ Evento ${eventId} subido a la nube correctamente.`);
      return true;
    } catch (error) {
      console.error(`[SyncService] ❌ Falló la sincronización a la nube del evento ${eventId}:`, error);

      // Marcar como fallido
      await this.eventsRepo.updateSyncStatus(eventId, "failed");
      return false;
    }
  }

  async syncAllPendingEvents(): Promise<{ successCount: number; failedCount: number }> {
    if (!this.cloudSyncRepo.isConfigured()) {
      throw new Error("No cloud DB configured");
    }

    const pendingEvents = await this.eventsRepo.getPendingSync();
    if (pendingEvents.length === 0) {
      return { successCount: 0, failedCount: 0 };
    }

    let successCount = 0;
    let failedCount = 0;

    for (const event of pendingEvents) {
      try {
        const orders = await this.ordersRepo.listForEvent(event.id);
        const cashSales = await this.cashSalesRepo.listForEvent(event.id);
        const totals = computeTotals(orders, cashSales);

        const synced = await this.pushEventData(event.id, event, totals);
        if (synced) {
          successCount++;
        } else {
          failedCount++;
        }
      } catch (err) {
        console.error(`[SyncService] Error manually syncing event ${event.id}:`, err);
        failedCount++;
      }
    }

    return { successCount, failedCount };
  }
}
