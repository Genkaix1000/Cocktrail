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
  it("getStatus hace GET a /api/printer/status", async () => {
    const expected = { connected: true, configured: true, message: "ok" };
    mockedApiFetch.mockResolvedValueOnce(expected);

    const result = await printerService.getStatus();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/printer/status");
    expect(result).toBe(expected);
  });

  it("test hace POST a /api/printer/test", async () => {
    mockedApiFetch.mockResolvedValueOnce({ success: true, message: "ok" });

    await printerService.test();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/printer/test", { method: "POST" });
  });

  it("reprint hace POST a /api/printer/reprint/:orderId", async () => {
    mockedApiFetch.mockResolvedValueOnce({ success: true, message: "ok" });

    await printerService.reprint("order-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/printer/reprint/order-1", { method: "POST" });
  });
});
