import { supabase } from "../../shared/supabase.js";

export type BarSession = {
  id: string;
  barId: string;
  userId: string;
  username: string;
  role: "caja" | "admin";
  connectedAt: string;
  lastSeenAt: string;
};

export interface BarSessionsRepository {
  findByBarId(barId: string): Promise<BarSession | null>;
  findByUserId(userId: string): Promise<BarSession | null>;
  listAll(): Promise<BarSession[]>;
  create(session: Omit<BarSession, "id" | "connectedAt">): Promise<BarSession>;
  deleteByBarId(barId: string): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
  deleteExpired(cutoffIso: string): Promise<void>;
  touchByUserId(userId: string): Promise<BarSession | null>;
}

type BarSessionRow = {
  id: string;
  bar_id: string;
  user_id: string;
  username: string;
  role: "caja" | "admin";
  connected_at: string;
  last_seen_at: string;
};

const SELECT_COLS =
  "id, bar_id, user_id, username, role, connected_at, last_seen_at";

function mapRow(row: BarSessionRow): BarSession {
  return {
    id: row.id,
    barId: row.bar_id,
    userId: row.user_id,
    username: row.username,
    role: row.role,
    connectedAt: row.connected_at,
    lastSeenAt: row.last_seen_at,
  };
}

export class SupabaseBarSessionsRepository implements BarSessionsRepository {
  async findByBarId(barId: string): Promise<BarSession | null> {
    const { data, error } = await supabase
      .from("bar_sessions")
      .select(SELECT_COLS)
      .eq("bar_id", barId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as BarSessionRow) : null;
  }

  async findByUserId(userId: string): Promise<BarSession | null> {
    const { data, error } = await supabase
      .from("bar_sessions")
      .select(SELECT_COLS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as BarSessionRow) : null;
  }

  async listAll(): Promise<BarSession[]> {
    const { data, error } = await supabase
      .from("bar_sessions")
      .select(SELECT_COLS)
      .order("connected_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => mapRow(row as BarSessionRow));
  }

  async create(session: Omit<BarSession, "id" | "connectedAt">): Promise<BarSession> {
    const { data, error } = await supabase
      .from("bar_sessions")
      .insert({
        bar_id: session.barId,
        user_id: session.userId,
        username: session.username,
        role: session.role,
        last_seen_at: session.lastSeenAt,
      })
      .select(SELECT_COLS)
      .single();
    if (error) throw error;
    return mapRow(data as BarSessionRow);
  }

  async deleteByBarId(barId: string): Promise<void> {
    const { error } = await supabase.from("bar_sessions").delete().eq("bar_id", barId);
    if (error) throw error;
  }

  async deleteByUserId(userId: string): Promise<void> {
    const { error } = await supabase.from("bar_sessions").delete().eq("user_id", userId);
    if (error) throw error;
  }

  async deleteExpired(cutoffIso: string): Promise<void> {
    const { error } = await supabase
      .from("bar_sessions")
      .delete()
      .lt("last_seen_at", cutoffIso);
    if (error) throw error;
  }

  async touchByUserId(userId: string): Promise<BarSession | null> {
    const { data, error } = await supabase
      .from("bar_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("user_id", userId)
      .select(SELECT_COLS)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as BarSessionRow) : null;
  }
}
