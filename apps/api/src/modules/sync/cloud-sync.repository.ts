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

/** Upsert a cloud en batches — espejo de batchUpsertLocal en la dirección opuesta
 * (mismo criterio que el batching inline de pushAuditLogs). */
async function batchUpsertCloud(
  table: string,
  rows: any[],
  options?: { onConflict?: string },
): Promise<SyncTableResult> {
  if (!supabaseCloud || rows.length === 0) return { ok: 0, failed: 0 };
  let ok = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = options?.onConflict
      ? await supabaseCloud.from(table).upsert(batch, { onConflict: options.onConflict })
      : await supabaseCloud.from(table).upsert(batch);
    if (error) {
      failed += batch.length;
      if (!firstError) firstError = error.message;
      console.error(`[SupabaseCloudSyncRepository] Error subiendo ${table} a cloud (upsert):`, error.message);
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
  /** Descarga `drink_categories` de cloud y hace upsert local. */
  pullDrinkCategories(): Promise<{ count: number }>;
  pushNightEvent(event: NightEvent, totals: EventTotals): Promise<void>;
  pushOrders(eventId: string, orders: Order[]): Promise<void>;
  pushTickets(tickets: Ticket[]): Promise<void>;
  /** Sube a cloud los cobros MP de UNA noche (por `event_id`). Filas con event_id NULL
   * (anteriores a 20260721000100) quedan fuera a propósito — decisión del PR 5. */
  pushMpOrders(eventId: string): Promise<SyncTableResult>;
  /** Sube la tabla completa de cajas (PDV) en cada cierre — tabla chica, sin outbox. */
  pushMpCajas(): Promise<SyncTableResult>;
  /** Sube la tabla completa de posnets en cada cierre — tabla chica, sin outbox. */
  pushMpDevices(): Promise<SyncTableResult>;
  /** Outbox del seller (`cloud_synced_at IS NULL`): sube SOLO metadata (D3 — las
   * columnas `_enc` jamás salen del local) y estampa `cloud_synced_at` al confirmar. */
  pushSellerMetadata(): Promise<SyncTableResult>;
  /** Restore completo (cloud → local), no destructivo, merge/upsert por id. */
  pullNightEvents(): Promise<SyncTableResult>;
  pullMpCajas(): Promise<SyncTableResult>;
  pullMpDevices(): Promise<SyncTableResult>;
  pullMpOrders(): Promise<SyncTableResult>;
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

  async pullDrinkCategories(): Promise<{ count: number }> {
    if (!supabaseCloud) return { count: 0 };
    const { data, error } = await supabaseCloud.from("drink_categories").select("*");
    if (error) {
      console.error(
        "[SupabaseCloudSyncRepository] Error descargando drink_categories:",
        error.message,
      );
      return { count: 0 };
    }
    if (!data || data.length === 0) return { count: 0 };
    const { error: upsertError } = await supabase.from("drink_categories").upsert(data);
    if (upsertError) {
      console.error(
        "[SupabaseCloudSyncRepository] Error escribiendo drink_categories en local:",
        upsertError.message,
      );
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
      // Columnas de cobro-verificado. En Cloud van SIN FK (archivo histórico);
      // requieren el DDL del paso 7.1 aplicado allá o el push entero falla.
      mp_order_id: o.paymentRecordId || null,
      mp_payment_id: o.paymentRef || null,
      idempotency_key: o.idempotencyKey || null,
      payment_status: o.paymentStatus || "desconocido",
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
   * Sube a cloud los `mp_orders` de la noche (por `event_id`). Passthrough local→cloud
   * (mismo criterio que pushAuditLogs: las filas ya están en forma). Requiere
   * pr5-cloud.sql aplicado allá: crea la tabla o la CONVERGE al espejo del esquema
   * local vigente — las tablas MP ya existían en Cloud con esquema viejo (la
   * integración pre-remediación del 2026-07-17 operaba contra Cloud vía `mpDb`).
   */
  async pushMpOrders(eventId: string): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabase.from("mp_orders").select("*").eq("event_id", eventId);
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error leyendo mp_orders local:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    return batchUpsertCloud("mp_orders", data ?? []);
  }

  /** Sube la tabla completa de cajas a cloud (passthrough, idempotente por id). */
  async pushMpCajas(): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabase.from("mercadopago_cajas").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error leyendo mercadopago_cajas local:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    return batchUpsertCloud("mercadopago_cajas", data ?? []);
  }

  /** Sube la tabla completa de posnets a cloud (passthrough, idempotente por id). */
  async pushMpDevices(): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabase.from("mercadopago_cajas_devices").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error leyendo mercadopago_cajas_devices local:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    return batchUpsertCloud("mercadopago_cajas_devices", data ?? []);
  }

  /**
   * Outbox del seller: sube a cloud la METADATA de las filas con `cloud_synced_at IS NULL`
   * y estampa `cloud_synced_at` al confirmar. Doble defensa para D3 (los tokens jamás
   * salen del local): el SELECT no pide las columnas `_enc` Y el mapeo de abajo es una
   * whitelist explícita — aunque el select trajera de más, no viajaría.
   * Upsert por `user_id` (onConflict): la fila cloud preexistente del OAuth tiene su
   * propio `id`, upsertear por PK duplicaría el user_id (UNIQUE en cloud).
   * `status`/`expires_at` NO se suben a propósito: en cloud los sellers quedaron
   * `expired` tras la purga de tokens del PR 4 y así deben quedar (allá no hay token).
   */
  async pushSellerMetadata(): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabase
      .from("mercadopago_sellers")
      .select("user_id, seller_nickname, seller_first_name, seller_last_name, seller_email, created_at, updated_at")
      .is("cloud_synced_at", null);
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error leyendo mercadopago_sellers local:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    if (!data || data.length === 0) return { ok: 0, failed: 0 };
    const rows = data.map((s: any) => ({
      user_id: s.user_id,
      seller_nickname: s.seller_nickname ?? null,
      seller_first_name: s.seller_first_name ?? null,
      seller_last_name: s.seller_last_name ?? null,
      seller_email: s.seller_email ?? null,
      created_at: s.created_at ?? null,
      updated_at: s.updated_at ?? null,
    }));
    const result = await batchUpsertCloud("mercadopago_sellers", rows, { onConflict: "user_id" });
    if (result.failed === 0 && result.ok > 0) {
      const { error: stampError } = await supabase
        .from("mercadopago_sellers")
        .update({ cloud_synced_at: new Date().toISOString() })
        .in("user_id", rows.map((r) => r.user_id));
      if (stampError) {
        // La metadata SÍ llegó a cloud; sin estampa, la próxima pasada re-sube
        // (idempotente por user_id) — se reporta sin contar como failed.
        console.error("[SupabaseCloudSyncRepository] Error estampando cloud_synced_at:", stampError.message);
        result.error = `Metadata subida pero cloud_synced_at no se estampó (se reintenta): ${stampError.message}`;
      }
    }
    return result;
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
   * Restore de `mercadopago_cajas` cloud → local (PR 5). Mapeo explícito + normalización
   * de NULLs (patrón pullNightEvents/fix de7c863: un NULL explícito de una fila cloud
   * vieja no dispara el DEFAULT local).
   * FKs locales reales: `bar_id` → bars, `seller_user_id` → mercadopago_sellers(user_id).
   * En un restore de cero el seller local NO existe (D3: los tokens jamás suben, hay que
   * re-vincular por OAuth) — el upsert falla con FK y se reporta distinguible: el flujo
   * es re-vincular y reintentar el restore (idempotente).
   */
  async pullMpCajas(): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabaseCloud.from("mercadopago_cajas").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error descargando mercadopago_cajas:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    const rows = (data ?? []).map((c: any) => ({
      id: c.id,
      bar_id: c.bar_id,
      store_id: c.store_id,
      external_pos_id: c.external_pos_id,
      pos_id_mp: c.pos_id_mp ?? null,
      qr_image: c.qr_image ?? null,
      qr_template: c.qr_template ?? null,
      seller_user_id: c.seller_user_id,
      created_at: c.created_at ?? null,
      store_name: c.store_name ?? null,
    }));
    const result = await batchUpsertLocal("mercadopago_cajas", rows);
    if (result.error?.includes("foreign key") || result.error?.includes("violates")) {
      result.error = `Cajas no restauradas: falta la barra o el seller local — re-vincular Mercado Pago por OAuth y reintentar el restore (${result.error})`;
    }
    return result;
  }

  /**
   * Restore de `mercadopago_cajas_devices` cloud → local (PR 5). Mapeo explícito:
   * - `is_active`/`created_at` son NOT NULL locales — un NULL explícito de cloud no
   *   dispara el DEFAULT y rechazaría la fila; se normalizan acá.
   * - `operating_mode` tiene CHECK local (PDV/STANDALONE/NULL) pero el DDL cloud no
   *   (archivo histórico) — un valor raro se normaliza a NULL, igual que el backfill
   *   de 20260724000000_gestion_posnets.sql.
   * El trigger local `caja_id` inmutable puede rechazar un upsert que intente mover un
   * device de caja — correcto: gana el invariante local, se reporta como failed.
   */
  async pullMpDevices(): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabaseCloud.from("mercadopago_cajas_devices").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error descargando mercadopago_cajas_devices:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    const restoredAt = new Date().toISOString();
    const rows = (data ?? []).map((d: any) => ({
      id: d.id,
      caja_id: d.caja_id ?? null,
      device_id: d.device_id,
      device_username: d.device_username ?? null,
      operating_mode: d.operating_mode === "PDV" || d.operating_mode === "STANDALONE" ? d.operating_mode : null,
      is_active: d.is_active ?? false,
      linked_at: d.linked_at ?? null,
      deactivated_at: d.deactivated_at ?? null,
      operating_mode_synced_at: d.operating_mode_synced_at ?? null,
      created_at: d.created_at ?? restoredAt,
    }));
    const result = await batchUpsertLocal("mercadopago_cajas_devices", rows);
    if (result.error?.includes("foreign key") || result.error?.includes("violates")) {
      result.error = `Posnets no restaurados: la caja asociada no llegó de cloud (${result.error})`;
    }
    return result;
  }

  /**
   * Restore de `mp_orders` cloud → local (PR 5). Mapeo explícito de TODAS las columnas
   * del esquema local vigente (hasta 20260722000000) + normalización:
   * - `status` NULL → 'unknown' (NOT NULL + CHECK locales; las filas cloud nacieron
   *   válidas en local, pero no se confía en eso para un NOT NULL).
   * Los CHECKs locales de negocio (processed requiere paid_amount+payment_id, point
   * requiere device_id) se dejan actuar: si una fila cloud los viola, mejor que falle
   * visible a que entre un cobro inconsistente. FKs locales `caja_id`/`event_id` — el
   * orden del restore (nights → cajas → acá) las satisface; si no, error distinguible.
   */
  async pullMpOrders(): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabaseCloud.from("mp_orders").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error descargando mp_orders:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    const rows = (data ?? []).map((m: any) => ({
      id: m.id,
      order_id_mp: m.order_id_mp,
      external_ref: m.external_ref,
      idempotency_key: m.idempotency_key,
      payment_transaction_id: m.payment_transaction_id ?? null,
      payment_id: m.payment_id ?? null,
      amount: m.amount,
      status: m.status ?? "unknown",
      type: m.type,
      bar_id: m.bar_id ?? null,
      caja_id: m.caja_id ?? null,
      created_at: m.created_at ?? null,
      updated_at: m.updated_at ?? null,
      event_id: m.event_id ?? null,
      qr_data: m.qr_data ?? null,
      expires_at: m.expires_at ?? null,
      device_id: m.device_id ?? null,
      attempt_id: m.attempt_id ?? null,
      raw_state: m.raw_state ?? null,
      payment_status: m.payment_status ?? null,
      payment_status_detail: m.payment_status_detail ?? null,
      paid_amount: m.paid_amount ?? null,
      verified_at: m.verified_at ?? null,
      verification_error: m.verification_error ?? null,
      cart_items: m.cart_items ?? null,
    }));
    const result = await batchUpsertLocal("mp_orders", rows);
    if (result.error?.includes("foreign key") || result.error?.includes("violates")) {
      result.error = `Cobros MP no restaurados: la noche o la caja asociada no llegó de cloud (${result.error})`;
    }
    return result;
  }

  /**
   * Restore de `orders` cloud → local. Passthrough con normalización puntual por drift
   * local↔cloud (mismo criterio que el mapeo explícito de pullNightEvents):
   * - `payment_status`: las filas cloud pre-migración de cobro lo traen en NULL explícito,
   *   que NO dispara el DEFAULT local ('desconocido', NOT NULL) y rechaza la fila entera.
   * - `mp_order_id`: FK a `mp_orders` local. Desde el PR 5 el restore baja `mp_orders`
   *   ANTES que `orders`, así que el lookup de abajo normalmente conserva la FK real;
   *   queda como red de seguridad para filas cloud pre-PR 5 o pulls parciales — si la
   *   fila no existe localmente, va NULL. `mp_payment_id` se conserva SIEMPRE: es la
   *   denormalización deliberada que sobrevive a un restore parcial.
   * `event_id` tiene FK a `night_events` (ON DELETE CASCADE) — si `pullNightEvents`
   * falló parcialmente para algún evento, el upsert de sus orders falla con 23503
   * (constraint real de Postgres); se reporta distinguible en `error`.
   */
  async pullOrders(): Promise<SyncTableResult> {
    if (!supabaseCloud) return { ok: 0, failed: 0 };
    const { data, error } = await supabaseCloud.from("orders").select("*");
    if (error) {
      console.error("[SupabaseCloudSyncRepository] Error descargando orders:", error.message);
      return { ok: 0, failed: 0, error: error.message };
    }
    const cloudRows = data ?? [];

    // Un solo lookup local (no una query por fila): qué mp_order_id de cloud existen acá.
    const mpIds = [...new Set(cloudRows.map((o: any) => o.mp_order_id).filter((id: any) => id != null))];
    let localMpIds = new Set<string>();
    if (mpIds.length > 0) {
      const { data: mpRows, error: mpError } = await supabase.from("mp_orders").select("id").in("id", mpIds);
      if (mpError) {
        // Conservador: si no se puede chequear, se anulan las FK (mp_payment_id queda igual).
        console.error("[SupabaseCloudSyncRepository] Error consultando mp_orders local:", mpError.message);
      } else {
        localMpIds = new Set((mpRows ?? []).map((r: any) => r.id));
      }
    }

    const rows = cloudRows.map((o: any) => ({
      ...o,
      payment_status: o.payment_status ?? "desconocido",
      mp_order_id: o.mp_order_id != null && localMpIds.has(o.mp_order_id) ? o.mp_order_id : null,
    }));
    const result = await batchUpsertLocal("orders", rows);
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
