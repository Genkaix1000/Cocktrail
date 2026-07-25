import { randomUUID, createHash } from "node:crypto";
import type { UsersRepository } from "../users/users.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { TicketsRepository } from "../tickets/tickets.repository.js";
import type { EventsRepository } from "../events/events.repository.js";
import type { CloudSyncRepository, SyncTableResult } from "./cloud-sync.repository.js";
import type { EventTotals, NightEvent } from "@cocktrail/shared";
import { computeTotals } from "@cocktrail/shared";
import { supabase } from "../../shared/supabase.js";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export type RestoreResult = {
  nightEvents: SyncTableResult;
  mpCajas: SyncTableResult;
  mpDevices: SyncTableResult;
  mpOrders: SyncTableResult;
  orders: SyncTableResult;
  tickets: SyncTableResult;
  auditLogs: SyncTableResult;
};

export class SyncService {
  constructor(
    private usersRepo: UsersRepository,
    private drinksRepo: DrinksRepository,
    private ordersRepo: OrdersRepository,
    private ticketsRepo: TicketsRepository,
    private eventsRepo: EventsRepository,
    private cloudSyncRepo: CloudSyncRepository,
  ) {}

  /**
   * Siembra el admin/tragos por defecto LOCAL-ONLY (sin pasar por
   * usersRepo.create()/drinksRepo.create()) — esos métodos hacen dual-write a cloud si
   * `supabaseCloud` está configurado, y este seed de datos demo nunca debe empujarse a
   * cloud (comportamiento preexistente, preservado a propósito — ver pregunta abierta 1
   * de docs/specs/02-auditoria-api/deuda-estructural-fase2.md). Usa el cliente local directo por eso, no
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
    const { SEED_CATEGORIES, SEED_DRINKS } = await import("../../data/drinks.js");
    const categoriesToUpsert = SEED_CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      sort_order: c.sortOrder,
      is_system: c.isSystem ?? false,
    }));
    const { error: catError } = await supabase
      .from("drink_categories")
      .upsert(categoriesToUpsert);
    if (catError) {
      console.error("[SyncService] Error seeding drink_categories:", catError);
      throw catError;
    }

    const drinksToInsert = SEED_DRINKS.map((d) => ({
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
      available: d.available,
      category_id: d.categoryId ?? null,
      sort_order: d.sortOrder ?? 0,
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

      // 2. Pull categorías (antes que drinks por FK)
      const { count: categoriesCount } = await this.cloudSyncRepo.pullDrinkCategories();
      if (categoriesCount > 0) {
        console.log(`[SyncService] ✅ Categorías actualizadas: ${categoriesCount}`);
      }

      // 3. Pull Drinks
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
   * Incluye el evento en sí, todos los pedidos, tickets, y (PR 5) los cobros de
   * Mercado Pago de la noche + la config de cajas/posnets + la metadata del seller.
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

      // 5. Mercado Pago (PR 5): cajas → devices → cobros de la noche → metadata del
      // seller (outbox). Orden espejo del restore. Cualquier tabla con filas caídas
      // tira → catch de abajo → sync_status=failed, y el reintento (boot / sync
      // manual) re-empuja todo (upserts idempotentes).
      const mpPushes: Array<[string, SyncTableResult]> = [
        ["mercadopago_cajas", await this.cloudSyncRepo.pushMpCajas()],
        ["mercadopago_cajas_devices", await this.cloudSyncRepo.pushMpDevices()],
        ["mp_orders", await this.cloudSyncRepo.pushMpOrders(eventId)],
        ["mercadopago_sellers", await this.cloudSyncRepo.pushSellerMetadata()],
      ];
      const mpFailed = mpPushes.filter(([, r]) => r.failed > 0);
      if (mpFailed.length > 0) {
        throw new Error(
          `Push MP incompleto: ${mpFailed.map(([table, r]) => `${table} (${r.failed} filas: ${r.error ?? "sin detalle"})`).join("; ")}`,
        );
      }

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

    // Outbox del seller: corre en CADA pasada (boot + sync manual), haya o no noches
    // pendientes — es la única vía de subida cuando el seller se (re)vinculó sin que
    // cerrara ninguna noche. Nunca aborta la pasada: si falla, la próxima reintenta.
    try {
      const sellerResult = await this.cloudSyncRepo.pushSellerMetadata();
      if (sellerResult.failed > 0 || sellerResult.error) {
        console.error(`[SyncService] Outbox del seller con errores: ${sellerResult.error}`);
      }
    } catch (err) {
      console.error("[SyncService] Falló el outbox del seller:", err);
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
        const totals = computeTotals(orders);

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

  /**
   * Restore completo cloud → local: trae TODO el historial disponible en Supabase Cloud
   * (noches cerradas + sus pedidos/tickets + auditoría) y hace merge/upsert
   * por id en local — nunca destructivo, nunca borra nada que ya esté en local. Gana la
   * versión de cloud en conflicto. Pensado como recuperación de emergencia (botón manual en
   * /admin), no como parte del sync automático. Ver docs/specs/deuda-pre-fase-6/restaurar-backup-desde-cloud.md.
   *
   * Nunca lanza para abortar todo: cada tabla se intenta independientemente, un fallo en una
   * no impide intentar las demás (criterio 7 de la spec — parcial persiste, sin rollback).
   */
  async restoreFromCloud(): Promise<RestoreResult> {
    if (!this.cloudSyncRepo.isConfigured()) {
      const notConfigured: SyncTableResult = { ok: 0, failed: 0, error: "Supabase Cloud no está configurada." };
      return {
        nightEvents: notConfigured,
        mpCajas: notConfigured,
        mpDevices: notConfigured,
        mpOrders: notConfigured,
        orders: notConfigured,
        tickets: notConfigured,
        auditLogs: notConfigured,
      };
    }

    // Orden importa (integridad referencial LOCAL): nights primero, después la cadena MP
    // (cajas → devices → mp_orders: mp_orders tiene FK a cajas y a nights) y recién
    // entonces orders — con mp_orders ya restaurados, el lookup defensivo de pullOrders
    // conserva la FK mp_order_id real en vez de anularla (PR 5). Tokens del seller
    // EXCLUIDOS (D3): tras un restore hay que re-vincular por OAuth.
    // Cada pull ya maneja sus propios errores internamente y no lanza — el try/catch acá
    // es defensa en profundidad ante un fallo inesperado, para que uno no tumbe al resto.
    const safePull = async (label: string, fn: () => Promise<SyncTableResult>): Promise<SyncTableResult> => {
      try {
        return await fn();
      } catch (err: any) {
        console.error(`[SyncService] restoreFromCloud: fallo inesperado en ${label}:`, err);
        return { ok: 0, failed: 0, error: err?.message || String(err) };
      }
    };

    const nightEvents = await safePull("night_events", () => this.cloudSyncRepo.pullNightEvents());
    const mpCajas = await safePull("mercadopago_cajas", () => this.cloudSyncRepo.pullMpCajas());
    const mpDevices = await safePull("mercadopago_cajas_devices", () => this.cloudSyncRepo.pullMpDevices());
    const mpOrders = await safePull("mp_orders", () => this.cloudSyncRepo.pullMpOrders());
    const orders = await safePull("orders", () => this.cloudSyncRepo.pullOrders());
    const tickets = await safePull("tickets", () => this.cloudSyncRepo.pullTickets());
    const auditLogs = await safePull("audit_logs", () => this.cloudSyncRepo.pullAuditLogs());

    return { nightEvents, mpCajas, mpDevices, mpOrders, orders, tickets, auditLogs };
  }

  /**
   * Sube toda la auditoría local a cloud. Fire-and-forget (nunca lanza) — mismo criterio
   * que `syncEventToCloudBackground`: un fallo acá no debe impedir que la noche cierre.
   */
  async pushAuditLogsIfConfigured(): Promise<void> {
    if (!this.cloudSyncRepo.isConfigured()) return;
    try {
      const result = await this.cloudSyncRepo.pushAuditLogs();
      if (result.failed > 0) {
        console.error(`[SyncService] Push de audit_logs a cloud con errores: ${result.error}`);
      }
    } catch (err) {
      console.error("[SyncService] Falló el push de audit_logs a cloud:", err);
    }
  }
}
