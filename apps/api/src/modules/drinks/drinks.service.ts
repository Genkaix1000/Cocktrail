import type { Drink } from "@cocktrail/shared";
import { isWithinScheduleWindow } from "@cocktrail/shared";
import type { DrinksRepository } from "./drinks.repository.js";
import { BadRequest, NotFound } from "../../shared/errors/http-errors.js";
import type { EmitFn } from "../../shared/sse/sse-manager.js";

export class DrinksService {
  constructor(
    private repo: DrinksRepository,
    private emit?: EmitFn,
  ) {}

  async listDrinks(): Promise<Drink[]> {
    const drinks = await this.repo.list();
    const now = new Date();
    for (const d of drinks) {
      if (!d.scheduleEnabled || d.scheduleRepeatNextEvent || d.scheduleConsumed) continue;
      if (!isWithinScheduleWindow(d.scheduleFrom, d.scheduleUntil, now)) {
        d.scheduleConsumed = true;
        void this.repo.update(d.id, { scheduleConsumed: true }).catch((err) => {
          console.error("[DrinksService] scheduleConsumed:", err);
        });
      }
    }
    return drinks;
  }

  async getDrink(id: number): Promise<Drink | undefined> {
    return this.repo.findById(id);
  }

  async createDrink(input: Omit<Drink, "id">): Promise<Drink> {
    if (!input.name || input.name.trim().length === 0) {
      throw new BadRequest("El nombre del trago es requerido");
    }
    if (typeof input.price !== "number" || input.price <= 0) {
      throw new BadRequest("El precio debe ser un número positivo");
    }

    const id = await this.repo.nextId();
    const drink: Drink = {
      id,
      name: input.name.trim(),
      price: input.price,
      description: input.description ?? "",
      vibe: input.vibe ?? "",
      flavors: input.flavors ?? [],
      iconName: input.iconName ?? "glass-water",
      image: input.image,
      trending: input.trending ?? false,
      promo: input.promo ?? false,
      available: input.available ?? true,
      categoryId: input.categoryId ?? null,
      sortOrder: input.sortOrder ?? 0,
      scheduleEnabled: Boolean(input.scheduleEnabled),
      scheduleFrom: input.scheduleFrom ?? null,
      scheduleUntil: input.scheduleUntil ?? null,
      scheduleHideWhenExpired: Boolean(input.scheduleHideWhenExpired),
      scheduleMoveToCategoryId: input.scheduleMoveToCategoryId ?? null,
      scheduleRepeatNextEvent: Boolean(input.scheduleRepeatNextEvent),
      scheduleConsumed: false,
    };

    const created = await this.repo.create(drink);
    this.emit?.({ type: "carta.updated" });
    return created;
  }

  async updateDrink(id: number, partial: Partial<Omit<Drink, "id">>): Promise<Drink> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFound(`Trago con id ${id} no encontrado`);
    }

    if (partial.name !== undefined && partial.name.trim().length === 0) {
      throw new BadRequest("El nombre del trago no puede estar vacío");
    }
    if (partial.price !== undefined && (typeof partial.price !== "number" || partial.price <= 0)) {
      throw new BadRequest("El precio debe ser un número positivo");
    }

    const patch = { ...partial };
    if (patch.scheduleEnabled === true) {
      patch.scheduleConsumed = false;
    }

    const updated = await this.repo.update(id, patch);
    if (!updated) {
      throw new NotFound(`Trago con id ${id} no encontrado`);
    }
    this.emit?.({ type: "carta.updated" });
    return updated;
  }

  async deleteDrink(id: number): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFound(`Trago con id ${id} no encontrado`);
    }
    await this.repo.delete(id);
    this.emit?.({ type: "carta.updated" });
  }

  async reorderDrinks(categoryId: string | null, ids: number[]): Promise<Drink[]> {
    for (let i = 0; i < ids.length; i++) {
      await this.repo.update(ids[i], { sortOrder: i + 1 });
    }
    const all = await this.repo.list();
    const group = all.filter((d) => (categoryId ? d.categoryId === categoryId : !d.categoryId));
    const rest = group.filter((d) => !ids.includes(d.id));
    for (let i = 0; i < rest.length; i++) {
      await this.repo.update(rest[i].id, { sortOrder: ids.length + i + 1 });
    }
    this.emit?.({ type: "carta.updated" });
    return this.repo.list();
  }
}
