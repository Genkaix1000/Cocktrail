import { afterEach, describe, expect, it, vi } from "vitest";
import { printerService } from "./printer.service";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("printerService", () => {
  it("test hace POST a /api/printer/test", async () => {
    mockedApiFetch.mockResolvedValueOnce({ success: true, message: "ok", data: "YQ==" });

    await printerService.test();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/printer/test", { method: "POST" });
  });

  it("reprint hace POST a /api/printer/reprint/:orderId", async () => {
    mockedApiFetch.mockResolvedValueOnce({ success: true, message: "ok", data: "YQ==" });

    await printerService.reprint("order-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/printer/reprint/order-1", { method: "POST" });
  });

  it("splits con orden ghost manda el snapshot en el body", async () => {
    mockedApiFetch.mockResolvedValueOnce({ tickets: [] });
    const ghostOrder = {
      id: "ghost-1",
      ghost: true as const,
      items: [{ drinkId: 1, name: "Fernet", qty: 1, unitPrice: 10, subtotal: 10 }],
    };

    await printerService.splits(
      "ghost-1",
      [{ items: [{ drinkId: 1, qty: 1 }] }],
      ghostOrder as Parameters<typeof printerService.splits>[2],
    );

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/printer/splits/ghost-1", {
      method: "POST",
      body: { groups: [{ items: [{ drinkId: 1, qty: 1 }] }], order: ghostOrder },
    });
  });

  it("splits sin ghost no manda order", async () => {
    mockedApiFetch.mockResolvedValueOnce({ tickets: [] });

    await printerService.splits("order-1", [{ items: [{ drinkId: 1, qty: 1 }] }]);

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/printer/splits/order-1", {
      method: "POST",
      body: { groups: [{ items: [{ drinkId: 1, qty: 1 }] }] },
    });
  });
});
