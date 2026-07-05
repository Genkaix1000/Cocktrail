import { afterEach, describe, expect, it, vi } from "vitest";
import { cashSalesService } from "./cash-sales.service";
import { apiFetch } from "./api-client";
import type { CashSale, NewCashSaleInput } from "@cocktrail/shared";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("cashSalesService.add", () => {
  it("hace POST a /api/cash-sales con el input recibido", async () => {
    const input: NewCashSaleInput = { amount: 3000, description: "2 Fernet" };
    const expected = { id: "cs1" } as CashSale;
    mockedApiFetch.mockResolvedValueOnce(expected);

    const result = await cashSalesService.add(input);

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/cash-sales", {
      method: "POST",
      body: input,
    });
    expect(result).toBe(expected);
  });

  it("propaga el error si apiFetch rechaza", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("network down"));

    await expect(
      cashSalesService.add({ amount: 1000, description: "x" }),
    ).rejects.toThrow("network down");
  });
});

describe("cashSalesService.list", () => {
  it("hace GET a /api/cash-sales", async () => {
    const expected: CashSale[] = [];
    mockedApiFetch.mockResolvedValueOnce(expected);

    const result = await cashSalesService.list();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/cash-sales");
    expect(result).toBe(expected);
  });
});
