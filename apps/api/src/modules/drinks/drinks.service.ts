import type { Drink } from "@cocktrail/shared";
import type { DrinksRepository } from "./drinks.repository.js";
import { BadRequest, NotFound } from "../../shared/errors/http-errors.js";

export class DrinksService {
  constructor(private repo: DrinksRepository) {}

  async listDrinks(): Promise<Drink[]> {
    return this.repo.list();
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
    };

    return this.repo.create(drink);
  }

  async updateDrink(id: number, partial: Partial<Omit<Drink, "id">>): Promise<Drink> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFound(`Trago con id ${id} no encontrado`);
    }

    // Validar campos si se proporcionan
    if (partial.name !== undefined && partial.name.trim().length === 0) {
      throw new BadRequest("El nombre del trago no puede estar vacío");
    }
    if (partial.price !== undefined && (typeof partial.price !== "number" || partial.price <= 0)) {
      throw new BadRequest("El precio debe ser un número positivo");
    }

    const updated = await this.repo.update(id, partial);
    if (!updated) {
      throw new NotFound(`Trago con id ${id} no encontrado`);
    }
    return updated;
  }

  async deleteDrink(id: number): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFound(`Trago con id ${id} no encontrado`);
    }
    await this.repo.delete(id);
  }
}
