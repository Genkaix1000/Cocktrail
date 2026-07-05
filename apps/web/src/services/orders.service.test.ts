import { afterEach, describe, expect, it, vi } from "vitest";
import { ordersService } from "./orders.service";
import { apiFetch } from "./api-client";
import type { NewOrderInput, Order } from "@cocktrail/shared";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("ordersService", () => {
  it("create hace POST a /api/orders con el input", async () => {
    const input: NewOrderInput = { items: [{ drinkId: 1, qty: 2 }], paymentMethod: "efectivo" };
    mockedApiFetch.mockResolvedValueOnce({ id: "o1", printed: true } as Order & { printed: boolean });

    await ordersService.create(input);

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/orders", {
      method: "POST",
      body: input,
    });
  });

  it("updateStatus hace PATCH a /api/orders/:id con el status", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "o1" } as Order);

    await ordersService.updateStatus("o1", "entregado");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/orders/o1", {
      method: "PATCH",
      body: { status: "entregado" },
    });
  });

  it("getByToken hace GET a /api/orders/by-token/:token", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "o1" } as Order);

    await ordersService.getByToken("tok-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/orders/by-token/tok-1");
  });

  it("listActive hace GET a /api/orders/active", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);

    await ordersService.listActive();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/orders/active");
  });

  it("list hace GET a /api/orders", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);

    await ordersService.list();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/orders");
  });

  it("getAuditLogs sin 'all' hace GET a /api/orders/log", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);

    await ordersService.getAuditLogs();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/orders/log");
  });

  it("getAuditLogs(true) hace GET a /api/orders/log?all=true", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);

    await ordersService.getAuditLogs(true);

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/orders/log?all=true");
  });
});
