import { supabase } from "../../shared/supabase.js";

export type Bar = {
  id: string;
  name: string | null;
  code: string | null;
  /** false = no aparece en el selector de caja. */
  enabled: boolean;
  createdAt: string;
};

type BarRow = {
  id: string;
  name: string | null;
  code: string | null;
  enabled: boolean | null;
  created_at: string;
};

function mapBarRow(row: BarRow): Bar {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    enabled: row.enabled !== false,
    createdAt: row.created_at,
  };
}

const SELECT_COLS = "id, name, code, enabled, created_at";

export interface BarsRepository {
  findByCode(code: string): Promise<Bar | null>;
  findById(id: string): Promise<Bar | null>;
  listAll(): Promise<Bar[]>;
  findOrCreateByCode(code: string, name?: string): Promise<Bar>;
  setEnabled(id: string, enabled: boolean): Promise<Bar>;
}

export class SupabaseBarsRepository implements BarsRepository {
  async findByCode(code: string): Promise<Bar | null> {
    const { data, error } = await supabase
      .from("bars")
      .select(SELECT_COLS)
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseBarsRepository] Error finding bar by code:", error);
      throw error;
    }

    return data ? mapBarRow(data as BarRow) : null;
  }

  async findById(id: string): Promise<Bar | null> {
    const { data, error } = await supabase
      .from("bars")
      .select(SELECT_COLS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseBarsRepository] Error finding bar by id:", error);
      throw error;
    }

    return data ? mapBarRow(data as BarRow) : null;
  }

  async listAll(): Promise<Bar[]> {
    const { data, error } = await supabase
      .from("bars")
      .select(SELECT_COLS)
      .order("name", { ascending: true });

    if (error) {
      console.error("[SupabaseBarsRepository] Error listing bars:", error);
      throw error;
    }

    return (data ?? []).map((row) => mapBarRow(row as BarRow));
  }

  async findOrCreateByCode(code: string, name?: string): Promise<Bar> {
    const existing = await this.findByCode(code);
    if (existing) return existing;

    const { data, error } = await supabase
      .from("bars")
      .insert({ code, name: name ?? code, enabled: true })
      .select(SELECT_COLS)
      .single();

    if (error) {
      if (error.code === "23505") {
        const raced = await this.findByCode(code);
        if (raced) return raced;
      }
      console.error("[SupabaseBarsRepository] Error creating bar:", error);
      throw error;
    }

    return mapBarRow(data as BarRow);
  }

  async setEnabled(id: string, enabled: boolean): Promise<Bar> {
    const { data, error } = await supabase
      .from("bars")
      .update({ enabled })
      .eq("id", id)
      .select(SELECT_COLS)
      .single();

    if (error) {
      console.error("[SupabaseBarsRepository] Error updating bar enabled:", error);
      throw error;
    }

    return mapBarRow(data as BarRow);
  }
}
