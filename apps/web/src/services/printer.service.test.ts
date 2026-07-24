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
});
