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

    if (!data) return null;

    return {
      id: data.id,
      status: data.status,
      startedAt: new Date(data.started_at).getTime(),
      closedAt: data.closed_at ? new Date(data.closed_at).getTime() : undefined,
      orderCounter: data.order_counter,
      closedBy: data.closed_by || undefined,
    };
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
        sync_status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("[SupabaseEventsRepository] Error creating event:", error);
      throw error;
    }

    return {
      id: data.id,
      status: data.status,
      startedAt: new Date(data.started_at).getTime(),
      closedAt: data.closed_at ? new Date(data.closed_at).getTime() : undefined,
      orderCounter: data.order_counter,
      closedBy: data.closed_by || undefined,
    };
  }

  async update(id: string, updates: Partial<NightEvent>): Promise<NightEvent> {
    const dbUpdates: any = {};
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

    return {
      id: data.id,
      status: data.status,
      startedAt: new Date(data.started_at).getTime(),
      closedAt: data.closed_at ? new Date(data.closed_at).getTime() : undefined,
      orderCounter: data.order_counter,
      closedBy: data.closed_by || undefined,
    };
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

    if (!data) return null;

    return {
      id: data.id,
      status: data.status,
      startedAt: new Date(data.started_at).getTime(),
      closedAt: data.closed_at ? new Date(data.closed_at).getTime() : undefined,
      orderCounter: data.order_counter,
      closedBy: data.closed_by || undefined,
    };
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

    return data.map((item: any) => ({
      id: item.id,
      status: item.status,
      startedAt: new Date(item.started_at).getTime(),
      closedAt: item.closed_at ? new Date(item.closed_at).getTime() : undefined,
      orderCounter: item.order_counter,
      closedBy: item.closed_by || undefined,
    }));
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
    const { data, error } = await supabase
      .from("night_events")
      .select("*")
      .eq("sync_status", "pending")
      .eq("status", "cerrado");

    if (error) {
      console.error("[SupabaseEventsRepository] Error getting pending syncs:", error);
      throw error;
    }

    return data.map((item: any) => ({
      id: item.id,
      status: item.status,
      startedAt: new Date(item.started_at).getTime(),
      closedAt: item.closed_at ? new Date(item.closed_at).getTime() : undefined,
      orderCounter: item.order_counter,
      closedBy: item.closed_by || undefined,
      sync_status: item.sync_status,
    }));
  }
}
