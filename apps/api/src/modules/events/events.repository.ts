import type { NightEvent } from "@cocktrail/shared";
import { supabase } from "../../shared/supabase.js";

export interface EventsRepository {
  getActive(): Promise<NightEvent | null>;
  create(event: NightEvent): Promise<NightEvent>;
  update(id: string, updates: Partial<NightEvent>): Promise<NightEvent>;
  findById(id: string): Promise<NightEvent | null>;
  listClosed(): Promise<NightEvent[]>;
  updateSyncStatus(id: string, syncStatus: "pending" | "synced" | "failed", syncedAt?: number): Promise<void>;
  getPendingSync(): Promise<(NightEvent & { sync_status: string })[]>;
  /** Borra la night_event — cascadea a orders/tickets/cash_sales (ON DELETE CASCADE). */
  delete(id: string): Promise<void>;
}

type NightEventRow = {
  id: string;
  status: NightEvent["status"];
  started_at: string;
  closed_at: string | null;
  order_counter: number;
  closed_by: string | null;
  keyword: string | null;
  sync_status?: string;
};

function mapRowToEvent(row: NightEventRow): NightEvent {
  return {
    id: row.id,
    status: row.status,
    startedAt: new Date(row.started_at).getTime(),
    closedAt: row.closed_at ? new Date(row.closed_at).getTime() : undefined,
    orderCounter: row.order_counter,
    closedBy: row.closed_by || undefined,
    keyword: row.keyword || undefined,
  };
}

export class SupabaseEventsRepository implements EventsRepository {
  async getActive(): Promise<NightEvent | null> {
    const { data, error } = await supabase
      .from("night_events")
      .select("*")
      .eq("status", "activo")
      .maybeSingle();

    if (error) {
      console.error("[SupabaseEventsRepository] Error getting active event:", error);
      throw error;
    }

    return data ? mapRowToEvent(data) : null;
  }

  async create(event: NightEvent): Promise<NightEvent> {
    const { data, error } = await supabase
      .from("night_events")
      .insert({
        id: event.id,
        status: event.status,
        started_at: new Date(event.startedAt).toISOString(),
        closed_at: event.closedAt ? new Date(event.closedAt).toISOString() : null,
        order_counter: event.orderCounter,
        closed_by: event.closedBy || null,
        keyword: event.keyword || null,
        sync_status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("[SupabaseEventsRepository] Error creating event:", error);
      throw error;
    }

    return mapRowToEvent(data);
  }

  async update(id: string, updates: Partial<NightEvent>): Promise<NightEvent> {
    const dbUpdates: Partial<Omit<NightEventRow, "id">> = {};
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.startedAt !== undefined) {
      dbUpdates.started_at = new Date(updates.startedAt).toISOString();
    }
    if (updates.closedAt !== undefined) {
      dbUpdates.closed_at = updates.closedAt ? new Date(updates.closedAt).toISOString() : null;
    }
    if (updates.orderCounter !== undefined) {
      dbUpdates.order_counter = updates.orderCounter;
    }
    if (updates.closedBy !== undefined) {
      dbUpdates.closed_by = updates.closedBy || null;
    }
    if (updates.keyword !== undefined) {
      dbUpdates.keyword = updates.keyword || null;
    }

    const { data, error } = await supabase
      .from("night_events")
      .update(dbUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[SupabaseEventsRepository] Error updating event:", error);
      throw error;
    }

    return mapRowToEvent(data);
  }

  async findById(id: string): Promise<NightEvent | null> {
    const { data, error } = await supabase
      .from("night_events")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseEventsRepository] Error finding event by id:", error);
      throw error;
    }

    return data ? mapRowToEvent(data) : null;
  }

  async listClosed(): Promise<NightEvent[]> {
    const { data, error } = await supabase
      .from("night_events")
      .select("*")
      .eq("status", "cerrado")
      .order("closed_at", { ascending: false });

    if (error) {
      console.error("[SupabaseEventsRepository] Error listing closed events:", error);
      throw error;
    }

    return data.map(mapRowToEvent);
  }

  async updateSyncStatus(id: string, syncStatus: "pending" | "synced" | "failed", syncedAt?: number): Promise<void> {
    const { error } = await supabase
      .from("night_events")
      .update({
        sync_status: syncStatus,
        synced_at: syncedAt ? new Date(syncedAt).toISOString() : null,
      })
      .eq("id", id);

    if (error) {
      console.error("[SupabaseEventsRepository] Error updating sync status:", error);
      throw error;
    }
  }

  async getPendingSync(): Promise<(NightEvent & { sync_status: string })[]> {
    // neq("synced"), no eq("pending"): también reintenta eventos que quedaron en "failed"
    // de un intento de sync anterior — mismo criterio que syncAllPendingEvents usaba antes
    // de esta refactor (SyncService pegándole directo a supabase.from). No tenía otro
    // caller hasta ahora, así que ajustar el filtro acá es seguro.
    const { data, error } = await supabase
      .from("night_events")
      .select("*")
      .neq("sync_status", "synced")
      .eq("status", "cerrado");

    if (error) {
      console.error("[SupabaseEventsRepository] Error getting pending syncs:", error);
      throw error;
    }

    return data.map((item: NightEventRow) => ({
      ...mapRowToEvent(item),
      sync_status: item.sync_status as string,
    }));
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("night_events").delete().eq("id", id);
    if (error) {
      console.error("[SupabaseEventsRepository] Error deleting event:", error);
      throw error;
    }
  }
}
