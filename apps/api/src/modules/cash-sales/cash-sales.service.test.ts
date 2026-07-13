import { describe, it, expect, vi } from "vitest";
import { CashSalesService } from "./cash-sales.service.js";
import type { CashSalesRepository } from "./cash-sales.repository.js";
import type { NightEvent } from "@cocktrail/shared";

function makeRepo(overrides?: Partial<CashSalesRepository>): CashSalesRepository {
  return {
    add: vi.fn().mockImplementation(async (sale) => sale),
    listForEvent: vi.fn().mockResolvedValue([]),
    clear: vi.fn(),
    ...overrides,
  };
}

const ACTIVE_EVENT: NightEvent = {
  id: "event-1",
  status: "activo",
  startedAt: Date.now(),
  orderCounter: 0,
};

describe("CashSalesService.addCashSale", () => {
  it("tira Conflict si no hay noche activa", async () => {
    const repo = makeRepo();
    const service = new CashSalesService(repo, async () => null, vi.fn());
    await expect(service.addCashSale({ amount: 1000, description: "test" }, "cajera1")).rejects.toThrow(/no se abrió la noche/);
  });

  it("tira BadRequest si el monto es inválido", async () => {
    const repo = makeRepo();
    const service = new CashSalesService(repo, async () => ACTIVE_EVENT, vi.fn());
    await expect(service.addCashSale({ amount: 0, description: "test" }, "cajera1")).rejects.toThrow(/inválido/);
  });

  it("guarda el ingreso y emite cash_sale.added con el colaborador inyectado", async () => {
    const repo = makeRepo();
    const emit = vi.fn();
    const service = new CashSalesService(repo, async () => ACTIVE_EVENT, emit);

    const result = await service.addCashSale({ amount: 1500, description: "hielo" }, "cajera1");

    expect(repo.add).toHaveBeenCalledWith(expect.objectContaining({ amount: 1500, description: "hielo", addedBy: "cajera1" }), "event-1");
    expect(emit).toHaveBeenCalledWith({ type: "cash_sale.added", cashSale: result });
  });
});

describe("CashSalesService.listCashSales", () => {
  it("sin noche activa devuelve []", async () => {
    const repo = makeRepo();
    const service = new CashSalesService(repo, async () => null, vi.fn());
    expect(await service.listCashSales()).toEqual([]);
  });

  it("con noche activa delega en el repo", async () => {
    const repo = makeRepo({ listForEvent: vi.fn().mockResolvedValue([{ id: "cs-1" }]) });
    const service = new CashSalesService(repo, async () => ACTIVE_EVENT, vi.fn());
    expect(await service.listCashSales()).toEqual([{ id: "cs-1" }]);
    expect(repo.listForEvent).toHaveBeenCalledWith("event-1");
  });
});
