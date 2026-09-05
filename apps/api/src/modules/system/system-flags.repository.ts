import { supabase } from "../../shared/supabase.js";

export const GHOST_MODE_FLAG = "ghost_mode";

export type SystemFlag = {
  key: string;
  value: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
};

export interface SystemFlagsRepository {
  get(key: string): Promise<boolean>;
  set(key: string, value: boolean, updatedBy: string): Promise<SystemFlag>;
}

export class SupabaseSystemFlagsRepository implements SystemFlagsRepository {
  async get(key: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("system_flags")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) throw error;
    return Boolean(data?.value);
  }

  async set(key: string, value: boolean, updatedBy: string): Promise<SystemFlag> {
    const updatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("system_flags")
      .upsert(
        { key, value, updated_at: updatedAt, updated_by: updatedBy },
        { onConflict: "key" },
      )
      .select("key, value, updated_at, updated_by")
      .single();

    if (error) throw error;
    return {
      key: data.key,
      value: Boolean(data.value),
      updatedAt: data.updated_at ? new Date(data.updated_at) : null,
      updatedBy: data.updated_by ?? null,
    };
  }
}
