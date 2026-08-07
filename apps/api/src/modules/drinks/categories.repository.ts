import type { DrinkCategory } from "@cocktrail/shared";
import { supabase } from "../../shared/supabase.js";

export interface DrinkCategoriesRepository {
  list(): Promise<DrinkCategory[]>;
  findById(id: string): Promise<DrinkCategory | undefined>;
  create(category: DrinkCategory): Promise<DrinkCategory>;
  update(id: string, partial: Partial<Omit<DrinkCategory, "id">>): Promise<DrinkCategory | undefined>;
  delete(id: string): Promise<boolean>;
}

type CategoryRow = {
  id: string;
  name: string;
  sort_order: number;
  is_system: boolean;
};

function mapRow(row: CategoryRow): DrinkCategory {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isSystem: row.is_system,
  };
}

function toPayload(category: DrinkCategory) {
  return {
    id: category.id,
    name: category.name,
    sort_order: category.sortOrder,
    is_system: category.isSystem ?? false,
  };
}

export class SupabaseDrinkCategoriesRepository implements DrinkCategoriesRepository {
  async list(): Promise<DrinkCategory[]> {
    const { data, error } = await supabase
      .from("drink_categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[SupabaseDrinkCategoriesRepository] Error listing:", error);
      throw error;
    }
    return data.map(mapRow);
  }

  async findById(id: string): Promise<DrinkCategory | undefined> {
    const { data, error } = await supabase
      .from("drink_categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseDrinkCategoriesRepository] Error finding:", error);
      throw error;
    }
    return data ? mapRow(data) : undefined;
  }

  async create(category: DrinkCategory): Promise<DrinkCategory> {
    const payload = toPayload(category);
    const { data, error } = await supabase.from("drink_categories").insert(payload).select().single();
    if (error) {
      console.error("[SupabaseDrinkCategoriesRepository] Error creating locally:", error);
      throw error;
    }

    return mapRow(data);
  }

  async update(
    id: string,
    partial: Partial<Omit<DrinkCategory, "id">>,
  ): Promise<DrinkCategory | undefined> {
    const updates: Partial<Omit<CategoryRow, "id">> = {};
    if (partial.name !== undefined) updates.name = partial.name;
    if (partial.sortOrder !== undefined) updates.sort_order = partial.sortOrder;
    if (partial.isSystem !== undefined) updates.is_system = partial.isSystem;

    const { data, error } = await supabase
      .from("drink_categories")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("[SupabaseDrinkCategoriesRepository] Error updating locally:", error);
      throw error;
    }

    return data ? mapRow(data) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase.from("drink_categories").delete().eq("id", id);
    if (error) {
      console.error("[SupabaseDrinkCategoriesRepository] Error deleting locally:", error);
      return false;
    }

    return true;
  }
}
