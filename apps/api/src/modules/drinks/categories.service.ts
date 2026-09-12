import type { DrinkCategory } from "@cocktrail/shared";
import type { DrinkCategoriesRepository } from "./categories.repository.js";
import { BadRequest, NotFound } from "../../shared/errors/http-errors.js";
import type { EmitFn } from "../../shared/sse/sse-manager.js";

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export class DrinkCategoriesService {
  constructor(
    private repo: DrinkCategoriesRepository,
    private emit?: EmitFn,
  ) {}

  list(): Promise<DrinkCategory[]> {
    return this.repo.list();
  }

  async create(input: { name: string; sortOrder?: number }): Promise<DrinkCategory> {
    const name = input.name?.trim();
    if (!name) throw new BadRequest("El nombre de la categoría es requerido");

    const baseId = slugify(name) || `cat-${Date.now()}`;
    let id = baseId;
    let n = 2;
    while (await this.repo.findById(id)) {
      id = `${baseId}-${n++}`;
    }

    const sortOrder =
      typeof input.sortOrder === "number" && input.sortOrder > 0
        ? Math.floor(input.sortOrder)
        : (await this.repo.list()).reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1;

    const created = await this.repo.create({ id, name, sortOrder, isSystem: false });
    this.emit?.({ type: "carta.updated" });
    return created;
  }

  async update(
    id: string,
    partial: { name?: string; sortOrder?: number },
  ): Promise<DrinkCategory> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFound(`Categoría ${id} no encontrada`);

    const patch: Partial<Omit<DrinkCategory, "id">> = {};
    if (partial.name !== undefined) {
      const name = partial.name.trim();
      if (!name) throw new BadRequest("El nombre de la categoría no puede estar vacío");
      patch.name = name;
    }
    if (partial.sortOrder !== undefined) {
      if (typeof partial.sortOrder !== "number" || partial.sortOrder < 1) {
        throw new BadRequest("sortOrder debe ser un entero >= 1");
      }
      patch.sortOrder = Math.floor(partial.sortOrder);
    }

    const updated = await this.repo.update(id, patch);
    if (!updated) throw new NotFound(`Categoría ${id} no encontrada`);
    this.emit?.({ type: "carta.updated" });
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFound(`Categoría ${id} no encontrada`);
    // ON DELETE SET NULL en drinks.category_id → los tragos quedan sin categoría.
    const ok = await this.repo.delete(id);
    if (!ok) throw new BadRequest("No se pudo eliminar la categoría");
    this.emit?.({ type: "carta.updated" });
  }

  /** Reasigna sortOrder 1..N según el orden de `ids`. */
  async reorder(ids: string[]): Promise<DrinkCategory[]> {
    if (ids.length === 0) return this.repo.list();
    const existing = await this.repo.list();
    const byId = new Map(existing.map((c) => [c.id, c]));
    for (const id of ids) {
      if (!byId.has(id)) throw new BadRequest(`Categoría desconocida: ${id}`);
    }
    for (let i = 0; i < ids.length; i++) {
      await this.repo.update(ids[i], { sortOrder: i + 1 });
    }
    // Categorías no incluidas en ids quedan al final.
    const rest = existing.filter((c) => !ids.includes(c.id));
    for (let i = 0; i < rest.length; i++) {
      await this.repo.update(rest[i].id, { sortOrder: ids.length + i + 1 });
    }
    this.emit?.({ type: "carta.updated" });
    return this.repo.list();
  }
}
