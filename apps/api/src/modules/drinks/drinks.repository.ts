import fs from "node:fs";
import path from "node:path";
import type { Drink } from "@cocktrail/shared";
import { SEED_DRINKS } from "../../data/drinks.js";

// ── Interface (contrato) ──

export interface DrinksRepository {
  list(): Drink[];
  findById(id: number): Drink | undefined;
  create(drink: Drink): Drink;
  update(id: number, partial: Partial<Omit<Drink, "id">>): Drink | undefined;
  delete(id: number): boolean;
  nextId(): number;
}

// ── Implementación In-Memory (fase 1 — legacy, mantener para tests) ──

export class InMemoryDrinksRepository implements DrinksRepository {
  private drinks = new Map<number, Drink>();

  constructor(seed: Drink[] = SEED_DRINKS) {
    for (const d of seed) this.drinks.set(d.id, d);
  }

  list(): Drink[] {
    return Array.from(this.drinks.values());
  }

  findById(id: number): Drink | undefined {
    return this.drinks.get(id);
  }

  create(drink: Drink): Drink {
    this.drinks.set(drink.id, drink);
    return drink;
  }

  update(id: number, partial: Partial<Omit<Drink, "id">>): Drink | undefined {
    const existing = this.drinks.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...partial };
    this.drinks.set(id, updated);
    return updated;
  }

  delete(id: number): boolean {
    return this.drinks.delete(id);
  }

  nextId(): number {
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

  list(): Drink[] {
    return Array.from(this.drinks.values());
  }

  findById(id: number): Drink | undefined {
    return this.drinks.get(id);
  }

  create(drink: Drink): Drink {
    this.drinks.set(drink.id, drink);
    this.persist();
    return drink;
  }

  update(id: number, partial: Partial<Omit<Drink, "id">>): Drink | undefined {
    const existing = this.drinks.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...partial };
    this.drinks.set(id, updated);
    this.persist();
    return updated;
  }

  delete(id: number): boolean {
    const deleted = this.drinks.delete(id);
    if (deleted) this.persist();
    return deleted;
  }

  nextId(): number {
    const ids = Array.from(this.drinks.keys());
    return ids.length === 0 ? 1 : Math.max(...ids) + 1;
  }
}
