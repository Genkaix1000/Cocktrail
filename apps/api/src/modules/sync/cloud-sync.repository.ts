import { supabase, supabaseCloud } from "../../shared/supabase.js";
import type { EventTotals, NightEvent, Order } from "@cocktrail/shared";
import type { Ticket } from "../tickets/tickets.repository.js";

/**
 * Concentra TODO el acceso directo a `supabaseCloud`/`supabase` que necesita el sync
 * local↔cloud — la única parte de `SyncService` que legítimamente no puede modelarse con
 * los repos locales ya auditados (dirección de lectura opuesta para pull, bulk-upsert de
 * filas ya existentes para push, upsert de filas ya-en-forma-cloud sin semántica de
 * dominio para la escritura local del pull). Ver docs/specs/02-auditoria-api/deuda-estructural-fase2.md
 * (punto 2) y la nota del agente `supabase-expert` de esa sesión.
 */

/** Resultado de traer/subir UNA tabla — nunca un booleano solo (ver el bug de
 * pullUsers/pullDrinks del 2026-07-13: reportar éxito sin chequear el error real). */
export type SyncTableResult = { ok: number; failed: number; error?: string };

const BATCH_SIZE = 500;

/** Upsert local en batches — acota el radio de un fallo parcial y da checkpoints
 * naturales para reportar progreso. A la escala de un boliche no hace falta paginar
 * la LECTURA de cloud (muy por debajo del límite de 1000 filas de PostgREST), solo
 * la ESCRITURA local se batchea. */
async function batchUpsertLocal(table: string, rows: any[]): Promise<SyncTableResult> {
  if (rows.length === 0) return { ok: 0, failed: 0 };
  let ok = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch);
    if (error) {
      failed += batch.length;
      if (!firstError) firstError = error.message;
      console.error(`[SupabaseCloudSyncRepository] Error escribiendo ${table} en local (upsert):`, error.message);
    } else {
      ok += batch.length;
    }
  }
  return { ok, failed, error: firstError };
}

export interface CloudSyncRepository {
  isConfigured(): boolean;
  /** Descarga `users` de cloud y hace upsert local (mismo esquema, sin mapeo de dominio). */
  pullUsers(): Promise<{ count: number }>;
  /** Descarga `drinks` de cloud y hace upsert local. */
  pullDrinks(): Promise<{ count: number }>;
  pushNightEvent(event: NightEvent, totals: EventTotals): Promise<void>;
  pushOrders(eventId: string, orders: Order[]): Promise<void>;
  pushTickets(tickets: Ticket[]): Promise<void>;
  /** Restore completo (cloud → local), no destructivo, merge/upsert por id. */
  pullNightEvents(): Promise<SyncTableResult>;
  pullOrders(): Promise<SyncTableResult>;
  pullTickets(): Promise<SyncTableResult>;
  pushAuditLogs(): Promise<SyncTableResult>;
  pullAuditLogs(): Promise<SyncTableResult>;
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

  /**
   * Restore de `night_events` cloud → local. Mapeo EXPLÍCITO (no passthrough como
   * users/drinks): confirmado en vivo (2026-07-13) que la tabla cloud NO tiene columna
   * `status` (local sí, NOT NULL) y SÍ tiene `totals` (cloud-only, R2 — no existe en
   * local a propósito). Todo lo que llegó a cloud se pusheó al cerrar una noche, así que
   * `status` se fuerza a "cerrado" — nunca hay noches `activo` en cloud.
   *
   * `keyword` (la palabra clave de la noche) tampoco existe en el esquema cloud — se
   * pierde en un restore, no hay forma de recuperarla desde acá. Limitación conocida,
   * no bloqueante (no es un dato de auditoría/venta, es un dato operativo del momento).
   */
  async pullNightEvents(): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabaseCloud.from("night_events").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error descargando night_events:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    const syncedAt = new Date().toISOString();
    const rows = (data ?? []).map((e: any) => ({
      id: e.id,
      status: "cerrado",
      started_at: e.started_at,
      closed_at: e.closed_at,
      order_counter: e.order_counter,
      closed_by: e.closed_by ?? null,
      keyword: null,
      sync_status: "synced",
      synced_at: syncedAt,
    }));
    return batchUpsertLocal("night_events", rows);
  }

  /**
   * Restore de `orders` cloud → local. Columnas confirmadas 1:1 con local (verificado en
   * vivo), passthrough directo. `event_id` tiene FK a `night_events` (ON DELETE CASCADE) —
   * si `pullNightEvents` falló parcialmente para algún evento, el upsert de sus orders
   * falla con 23503 (constraint real de Postgres); se reporta distinguible en `error`.
   */
  async pullOrders(): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabaseCloud.from("orders").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error descargando orders:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    const result = await batchUpsertLocal("orders", data ?? []);
    if (result.error?.includes("foreign key") || result.error?.includes("violates")) {
      result.error = `Pedidos no restaurados: la noche asociada no llegó de cloud (${result.error})`;
    }
    return result;
  }

  /** Restore de `tickets` cloud → local. Columnas 1:1 con local, passthrough. */
  async pullTickets(): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabaseCloud.from("tickets").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error descargando tickets:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    return batchUpsertLocal("tickets", data ?? []);
  }

  /**
   * Sube TODA la tabla local `audit_logs` a cloud (upsert por id, idempotente —
   * `id` es `gen_random_uuid()` fijado al insertar, re-subir no duplica ni cuesta caro
   * a esta escala). No pasa por `AuditLogsService` (bypasea su repo, mismo criterio que
   * pullUsers/pullDrinks) — `AuditLogsService.getLatest(limit)` no sirve para esto (es
   * paginado/ordenado, no "toda la tabla").
   */
  async pushAuditLogs(): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabase.from("audit_logs").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error leyendo audit_logs local:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    if (!data || data.length === 0) return { ok: 0, failed: 0 };
    let ok = 0;
    let failed = 0;
    let firstError: string | undefined;
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      const { error: upsertError } = await supabaseCloud.from("audit_logs").upsert(batch);
      if (upsertError) {
        failed += batch.length;
        if (!firstError) firstError = upsertError.message;
        console.error("[SupabaseCloudSyncRepository] Error subiendo audit_logs a cloud:", upsertError.message);
      } else {
        ok += batch.length;
      }
    }
    return { ok, failed, error: firstError };
  }

  /** Restore de `audit_logs` cloud → local. Columnas 1:1 (mismo esquema que push). */
  async pullAuditLogs(): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabaseCloud.from("audit_logs").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error descargando audit_logs:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    return batchUpsertLocal("audit_logs", data ?? []);
  }
}
