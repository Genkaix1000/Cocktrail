import fs from "node:fs";
import path from "node:path";
import type { Drink } from "@cocktrail/shared";
import { SEED_DRINKS } from "../../data/drinks.js";

// ── Interface (contrato) ──

export interface DrinksRepository {
  list(): Promise<Drink[]>;
  findById(id: number): Promise<Drink | undefined>;
  create(drink: Drink): Promise<Drink>;
  update(id: number, partial: Partial<Omit<Drink, "id">>): Promise<Drink | undefined>;
  delete(id: number): Promise<boolean>;
  nextId(): Promise<number>;
}

// ── Implementación In-Memory (fase 1 — legacy, mantener para tests) ──

export class InMemoryDrinksRepository implements DrinksRepository {
  private drinks = new Map<number, Drink>();

  constructor(seed: Drink[] = SEED_DRINKS) {
    for (const d of seed) this.drinks.set(d.id, d);
  }

  async list(): Promise<Drink[]> {
    return Array.from(this.drinks.values());
  }

  async findById(id: number): Promise<Drink | undefined> {
    return this.drinks.get(id);
  }

  async create(drink: Drink): Promise<Drink> {
    this.drinks.set(drink.id, drink);
    return drink;
  }

  async update(id: number, partial: Partial<Omit<Drink, "id">>): Promise<Drink | undefined> {
    const existing = this.drinks.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...partial };
    this.drinks.set(id, updated);
    return updated;
  }

  async delete(id: number): Promise<boolean> {
    return this.drinks.delete(id);
  }

  async nextId(): Promise<number> {
    const ids = Array.from(this.drinks.keys());
    return ids.length === 0 ? 1 : Math.max(...ids) + 1;
  }
}

// ── Implementación JSON Local (fase 3.5 — persistencia en disco) ──

const DATA_DIR = path.resolve(
  new URL(".", import.meta.url).pathname,
  "../../data",
);
const DRINKS_FILE = path.join(DATA_DIR, "drinks.json");

export class LocalJSONDrinksRepository implements DrinksRepository {
  private drinks = new Map<number, Drink>();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(DRINKS_FILE)) {
        const raw = fs.readFileSync(DRINKS_FILE, "utf-8");
        const arr: Drink[] = JSON.parse(raw);
        this.drinks.clear();
        for (const d of arr) this.drinks.set(d.id, d);
      } else {
        // Si no existe el JSON, cargar la semilla del TS y crear el archivo
        for (const d of SEED_DRINKS) this.drinks.set(d.id, d);
        this.persist();
      }
    } catch (err) {
      console.error("[LocalJSONDrinksRepository] Error loading drinks.json:", err);
      // Fallback a seed
      for (const d of SEED_DRINKS) this.drinks.set(d.id, d);
    }
  }

  private persist(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const arr = Array.from(this.drinks.values());
      fs.writeFileSync(DRINKS_FILE, JSON.stringify(arr, null, 2), "utf-8");
    } catch (err) {
      console.error("[LocalJSONDrinksRepository] Error persisting drinks.json:", err);
    }
  }

  async list(): Promise<Drink[]> {
    return Array.from(this.drinks.values());
  }

  async findById(id: number): Promise<Drink | undefined> {
    return this.drinks.get(id);
  }

  async create(drink: Drink): Promise<Drink> {
    this.drinks.set(drink.id, drink);
    this.persist();
    return drink;
  }

  async update(id: number, partial: Partial<Omit<Drink, "id">>): Promise<Drink | undefined> {
    const existing = this.drinks.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...partial };
    this.drinks.set(id, updated);
    this.persist();
    return updated;
  }

  async delete(id: number): Promise<boolean> {
    const deleted = this.drinks.delete(id);
    if (deleted) this.persist();
    return deleted;
  }

  async nextId(): Promise<number> {
    const ids = Array.from(this.drinks.keys());
    return ids.length === 0 ? 1 : Math.max(...ids) + 1;
  }
}

// ── Implementación Supabase (fase 4 — Edge Sync) ──

import { supabase, supabaseCloud } from "../../shared/supabase.js";

function mapRowToDrink(row: any): Drink {
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
    const { data, error } = await supabase
      .from("drinks")
      .insert({
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
      })
      .select()
      .single();

    if (error) {
      console.error("[SupabaseDrinksRepository] Error creating drink locally:", error);
      throw error;
    }

    if (supabaseCloud) {
      try {
        const { error: cloudError } = await supabaseCloud
          .from("drinks")
          .insert({
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
          });
        if (cloudError) {
          console.error("[SupabaseDrinksRepository] Error creating drink in cloud:", cloudError);
        } else {
          console.log(`[SupabaseDrinksRepository] Drink ${drink.id} synced to cloud.`);
        }
      } catch (err) {
        console.error("[SupabaseDrinksRepository] Exception syncing drink to cloud:", err);
      }
    }

    return mapRowToDrink(data);
  }

  async update(id: number, partial: Partial<Omit<Drink, "id">>): Promise<Drink | undefined> {
    const updates: any = {};
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

    if (data && supabaseCloud) {
      try {
        const { error: cloudError } = await supabaseCloud
          .from("drinks")
          .update(updates)
          .eq("id", id);
        if (cloudError) {
          console.error("[SupabaseDrinksRepository] Error updating drink in cloud:", cloudError);
        } else {
          console.log(`[SupabaseDrinksRepository] Drink ${id} update synced to cloud.`);
        }
      } catch (err) {
        console.error("[SupabaseDrinksRepository] Exception updating drink in cloud:", err);
      }
    }

    return data ? mapRowToDrink(data) : undefined;
  }

  async delete(id: number): Promise<boolean> {
    const { error } = await supabase
      .from("drinks")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[SupabaseDrinksRepository] Error deleting drink locally:", error);
      return false;
    }

    if (supabaseCloud) {
      try {
        const { error: cloudError } = await supabaseCloud
          .from("drinks")
          .delete()
          .eq("id", id);
        if (cloudError) {
          console.error("[SupabaseDrinksRepository] Error deleting drink in cloud:", cloudError);
        } else {
          console.log(`[SupabaseDrinksRepository] Drink ${id} deletion synced to cloud.`);
        }
      } catch (err) {
        console.error("[SupabaseDrinksRepository] Exception deleting drink in cloud:", err);
      }
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
