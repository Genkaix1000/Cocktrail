import { describe, it, expect, vi } from "vitest";
import { DrinkCategoriesService } from "./categories.service.js";
import type { DrinkCategoriesRepository } from "./categories.repository.js";
import type { DrinkCategory } from "@cocktrail/shared";

function makeRepo(overrides?: Partial<DrinkCategoriesRepository>): DrinkCategoriesRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockImplementation(async (c) => c),
    update: vi.fn().mockImplementation(async (id, patch) => ({
      id,
      name: "x",
      sortOrder: 1,
      isSystem: false,
      ...patch,
    })),
    delete: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("DrinkCategoriesService", () => {
  it("crea categoría con slug y sortOrder al final", async () => {
    const existing: DrinkCategory[] = [
      { id: "cervezas", name: "Cervezas", sortOrder: 1, isSystem: true },
    ];
    const repo = makeRepo({
      list: vi.fn().mockResolvedValue(existing),
      findById: vi.fn().mockResolvedValue(undefined),
    });
    const service = new DrinkCategoriesService(repo);
    const cat = await service.create({ name: "  Custom  " });
    expect(cat.id).toBe("custom");
    expect(cat.name).toBe("Custom");
    expect(cat.sortOrder).toBe(2);
    expect(cat.isSystem).toBe(false);
  });

  it("permite borrar categorías de sistema (tragos quedan sin categoría vía FK)", async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue({
        id: "cervezas",
        name: "Cervezas",
        sortOrder: 1,
        isSystem: true,
      }),
    });
    const service = new DrinkCategoriesService(repo);
    await service.delete("cervezas");
    expect(repo.delete).toHaveBeenCalledWith("cervezas");
  });

  it("reordena asignando sortOrder 1..N", async () => {
    const existing: DrinkCategory[] = [
      { id: "a", name: "A", sortOrder: 1 },
      { id: "b", name: "B", sortOrder: 2 },
      { id: "c", name: "C", sortOrder: 3 },
    ];
    const repo = makeRepo({
      list: vi
        .fn()
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce([
          { id: "c", name: "C", sortOrder: 1 },
          { id: "a", name: "A", sortOrder: 2 },
          { id: "b", name: "B", sortOrder: 3 },
        ]),
    });
    const service = new DrinkCategoriesService(repo);
    await service.reorder(["c", "a", "b"]);
    expect(repo.update).toHaveBeenCalledWith("c", { sortOrder: 1 });
    expect(repo.update).toHaveBeenCalledWith("a", { sortOrder: 2 });
    expect(repo.update).toHaveBeenCalledWith("b", { sortOrder: 3 });
  });
});
