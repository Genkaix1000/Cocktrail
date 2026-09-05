import type { Drink } from "@cocktrail/shared";

export interface DrinksRepository {
  list(): Promise<Drink[]>;
  findById(id: number): Promise<Drink | undefined>;
  create(drink: Drink): Promise<Drink>;
  update(id: number, partial: Partial<Omit<Drink, "id">>): Promise<Drink | undefined>;
  delete(id: number): Promise<boolean>;
  nextId(): Promise<number>;
}

import { supabase } from "../../shared/supabase.js";

type DrinkRow = {
  id: number;
  name: string;
  price: number;
  description: string;
  vibe: string;
  flavors: string[];
  icon_name: string;
  image: string | null;
  trending: boolean;
  promo: boolean | null;
  available: boolean;
  category_id: string | null;
  sort_order: number | null;
  schedule_enabled?: boolean | null;
  schedule_from?: string | null;
  schedule_until?: string | null;
  schedule_hide_when_expired?: boolean | null;
  schedule_move_to_category_id?: string | null;
  schedule_repeat_next_event?: boolean | null;
  schedule_consumed?: boolean | null;
};

function mapRowToDrink(row: DrinkRow): Drink {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    description: row.description,
    vibe: row.vibe,
    flavors: row.flavors,
    iconName: row.icon_name,
    image: row.image || undefined,
    trending: row.trending,
    promo: row.promo || undefined,
    available: row.available,
    categoryId: row.category_id,
    sortOrder: row.sort_order ?? 0,
    scheduleEnabled: Boolean(row.schedule_enabled),
    scheduleFrom: row.schedule_from ?? null,
    scheduleUntil: row.schedule_until ?? null,
    scheduleHideWhenExpired: Boolean(row.schedule_hide_when_expired),
    scheduleMoveToCategoryId: row.schedule_move_to_category_id ?? null,
    scheduleRepeatNextEvent: Boolean(row.schedule_repeat_next_event),
    scheduleConsumed: Boolean(row.schedule_consumed),
  };
}

function toInsertPayload(drink: Drink) {
  return {
    id: drink.id,
    name: drink.name,
    price: drink.price,
    description: drink.description,
    vibe: drink.vibe,
    flavors: drink.flavors,
    icon_name: drink.iconName,
    image: drink.image || null,
    trending: drink.trending,
    promo: drink.promo || false,
    available: drink.available,
    category_id: drink.categoryId ?? null,
    sort_order: drink.sortOrder ?? 0,
    schedule_enabled: Boolean(drink.scheduleEnabled),
    schedule_from: drink.scheduleFrom ?? null,
    schedule_until: drink.scheduleUntil ?? null,
    schedule_hide_when_expired: Boolean(drink.scheduleHideWhenExpired),
    schedule_move_to_category_id: drink.scheduleMoveToCategoryId ?? null,
    schedule_repeat_next_event: Boolean(drink.scheduleRepeatNextEvent),
    schedule_consumed: Boolean(drink.scheduleConsumed),
  };
}

export class SupabaseDrinksRepository implements DrinksRepository {
  async list(): Promise<Drink[]> {
    const { data, error } = await supabase
      .from("drinks")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("[SupabaseDrinksRepository] Error listing drinks:", error);
      throw error;
    }

    return data.map(mapRowToDrink);
  }

  async findById(id: number): Promise<Drink | undefined> {
    const { data, error } = await supabase
      .from("drinks")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseDrinksRepository] Error finding drink:", error);
      throw error;
    }

    return data ? mapRowToDrink(data) : undefined;
  }

  async create(drink: Drink): Promise<Drink> {
    const payload = toInsertPayload(drink);
    const { data, error } = await supabase.from("drinks").insert(payload).select().single();

    if (error) {
      console.error("[SupabaseDrinksRepository] Error creating drink locally:", error);
      throw error;
    }

    return mapRowToDrink(data);
  }

  async update(id: number, partial: Partial<Omit<Drink, "id">>): Promise<Drink | undefined> {
    const updates: Partial<Omit<DrinkRow, "id">> = {};
    if (partial.name !== undefined) updates.name = partial.name;
    if (partial.price !== undefined) updates.price = partial.price;
    if (partial.description !== undefined) updates.description = partial.description;
    if (partial.vibe !== undefined) updates.vibe = partial.vibe;
    if (partial.flavors !== undefined) updates.flavors = partial.flavors;
    if (partial.iconName !== undefined) updates.icon_name = partial.iconName;
    if (partial.image !== undefined) updates.image = partial.image || null;
    if (partial.trending !== undefined) updates.trending = partial.trending;
    if (partial.promo !== undefined) updates.promo = partial.promo;
    if (partial.available !== undefined) updates.available = partial.available;
    if (partial.categoryId !== undefined) updates.category_id = partial.categoryId || null;
    if (partial.sortOrder !== undefined) updates.sort_order = partial.sortOrder ?? 0;
    if (partial.scheduleEnabled !== undefined) updates.schedule_enabled = partial.scheduleEnabled;
    if (partial.scheduleFrom !== undefined) updates.schedule_from = partial.scheduleFrom || null;
    if (partial.scheduleUntil !== undefined) updates.schedule_until = partial.scheduleUntil || null;
    if (partial.scheduleHideWhenExpired !== undefined) {
      updates.schedule_hide_when_expired = partial.scheduleHideWhenExpired;
    }
    if (partial.scheduleMoveToCategoryId !== undefined) {
      updates.schedule_move_to_category_id = partial.scheduleMoveToCategoryId || null;
    }
    if (partial.scheduleRepeatNextEvent !== undefined) {
      updates.schedule_repeat_next_event = partial.scheduleRepeatNextEvent;
    }
    if (partial.scheduleConsumed !== undefined) updates.schedule_consumed = partial.scheduleConsumed;

    const { data, error } = await supabase
      .from("drinks")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("[SupabaseDrinksRepository] Error updating drink locally:", error);
      throw error;
    }

    return data ? mapRowToDrink(data) : undefined;
  }

  async delete(id: number): Promise<boolean> {
    const { error } = await supabase.from("drinks").delete().eq("id", id);

    if (error) {
      console.error("[SupabaseDrinksRepository] Error deleting drink locally:", error);
      return false;
    }

    return true;
  }

  async nextId(): Promise<number> {
    const { data, error } = await supabase
      .from("drinks")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseDrinksRepository] Error getting next id:", error);
      return 1;
    }

    return data ? data.id + 1 : 1;
  }
}
