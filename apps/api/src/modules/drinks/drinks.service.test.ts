import { describe, it, expect, vi, beforeEach } from "vitest";
import { DrinksService } from "./drinks.service.js";
import type { DrinksRepository } from "./drinks.repository.js";
import type { Drink } from "@cocktrail/shared";

function makeRepo(overrides?: Partial<DrinksRepository>): DrinksRepository {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    nextId: vi.fn(),
    ...overrides,
  };
}

function makeDrinkInput(overrides?: Partial<Omit<Drink, "id">>): Omit<Drink, "id"> {
  return {
    name: "Fernet con Coca",
    price: 3000,
    description: "clásico",
    vibe: "previa",
    flavors: ["amargo"],
    iconName: "glass-water",
    trending: false,
    promo: false,
    available: true,
    ...overrides,
  };
}

describe("DrinksService.createDrink", () => {
  it("rechaza si el nombre está vacío", async () => {
    const repo = makeRepo();
    const service = new DrinksService(repo);
    await expect(service.createDrink(makeDrinkInput({ name: "  " }))).rejects.toThrow(/nombre/);
  });

  it("rechaza si el precio no es positivo", async () => {
    const repo = makeRepo();
    const service = new DrinksService(repo);
    await expect(service.createDrink(makeDrinkInput({ price: 0 }))).rejects.toThrow(/precio/i);
  });

  it("crea el trago con el próximo id del repositorio y valores por defecto", async () => {
    const repo = makeRepo({
      nextId: vi.fn().mockResolvedValue(5),
      create: vi.fn().mockImplementation(async (d) => d),
    });
    const service = new DrinksService(repo);
    const drink = await service.createDrink(makeDrinkInput({ description: undefined as any }));
    expect(drink.id).toBe(5);
    expect(drink.description).toBe("");
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ id: 5, name: "Fernet con Coca" }));
  });
});

describe("DrinksService.updateDrink", () => {
  let repo: DrinksRepository;
  let service: DrinksService;

  beforeEach(() => {
    repo = makeRepo();
    service = new DrinksService(repo);
  });

  it("tira NotFound si el trago no existe", async () => {
    vi.mocked(repo.findById).mockResolvedValue(undefined);
    await expect(service.updateDrink(99, { name: "x" })).rejects.toThrow(/no encontrado/);
  });

  it("rechaza nombre vacío en la actualización", async () => {
    vi.mocked(repo.findById).mockResolvedValue({ ...makeDrinkInput(), id: 1 });
    await expect(service.updateDrink(1, { name: "   " })).rejects.toThrow(/nombre/i);
  });

  it("rechaza precio no positivo en la actualización", async () => {
    vi.mocked(repo.findById).mockResolvedValue({ ...makeDrinkInput(), id: 1 });
    await expect(service.updateDrink(1, { price: -10 })).rejects.toThrow(/precio/i);
  });

  it("actualiza el trago cuando los datos son válidos", async () => {
    const existing = { ...makeDrinkInput(), id: 1 };
    vi.mocked(repo.findById).mockResolvedValue(existing);
    vi.mocked(repo.update).mockResolvedValue({ ...existing, price: 3500 });
    const updated = await service.updateDrink(1, { price: 3500 });
    expect(updated.price).toBe(3500);
  });
});

describe("DrinksService.deleteDrink", () => {
  it("tira NotFound si el trago no existe", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(undefined) });
    const service = new DrinksService(repo);
    await expect(service.deleteDrink(99)).rejects.toThrow(/no encontrado/);
  });

  it("borra el trago si existe", async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue({ ...makeDrinkInput(), id: 1 }),
      delete: vi.fn().mockResolvedValue(true),
    });
    const service = new DrinksService(repo);
    await service.deleteDrink(1);
    expect(repo.delete).toHaveBeenCalledWith(1);
  });
});

describe("DrinksService.reorderDrinks", () => {
  it("asigna sortOrder 1..N según el orden de ids y emite carta.updated", async () => {
    const emit = vi.fn();
    const repo = makeRepo({
      list: vi.fn().mockResolvedValue([
        { id: 10, categoryId: "vodka", sortOrder: 1 },
        { id: 20, categoryId: "vodka", sortOrder: 2 },
        { id: 30, categoryId: "vodka", sortOrder: 3 },
      ]),
      update: vi.fn().mockResolvedValue({ id: 10 }),
    });
    const service = new DrinksService(repo, emit);
    await service.reorderDrinks("vodka", [30, 10, 20]);

    expect(repo.update).toHaveBeenCalledWith(30, { sortOrder: 1 });
    expect(repo.update).toHaveBeenCalledWith(10, { sortOrder: 2 });
    expect(repo.update).toHaveBeenCalledWith(20, { sortOrder: 3 });
    expect(emit).toHaveBeenCalledWith({ type: "carta.updated" });
  });
});
