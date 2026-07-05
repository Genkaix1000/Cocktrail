import { afterEach, describe, expect, it, vi } from "vitest";
import { drinksService } from "./drinks.service";
import { apiFetch } from "./api-client";
import type { Drink } from "@cocktrail/shared";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("drinksService", () => {
  it("list hace GET a /api/drinks", async () => {
    const expected: Drink[] = [];
    mockedApiFetch.mockResolvedValueOnce(expected);

    const result = await drinksService.list();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/drinks");
    expect(result).toBe(expected);
  });

  it("create hace POST a /api/drinks con el input", async () => {
    const input = { name: "Fernet", price: 2500 } as Omit<Drink, "id">;
    mockedApiFetch.mockResolvedValueOnce({ id: 1, ...input } as Drink);

    await drinksService.create(input);

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/drinks", {
      method: "POST",
      body: input,
    });
  });

  it("update hace PATCH a /api/drinks/:id con el partial", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 1, name: "Fernet" } as Drink);

    await drinksService.update(1, { available: false });

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/drinks/1", {
      method: "PATCH",
      body: { available: false },
    });
  });

  it("delete hace DELETE a /api/drinks/:id", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true });

    await drinksService.delete(1);

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/drinks/1", { method: "DELETE" });
  });
});
