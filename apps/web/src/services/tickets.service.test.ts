import { afterEach, describe, expect, it, vi } from "vitest";
import { ticketsService } from "./tickets.service";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("ticketsService.redeem", () => {
  it("hace POST a /api/tickets/redeem con el code", async () => {
    const expected = { success: true, status: "success" };
    mockedApiFetch.mockResolvedValueOnce(expected);

    const result = await ticketsService.redeem("ABC123");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/tickets/redeem", {
      method: "POST",
      body: { code: "ABC123" },
    });
    expect(result).toBe(expected);
  });

  it("mergea las options (barCode/method) en el body", async () => {
    mockedApiFetch.mockResolvedValueOnce({ success: true, status: "success" });

    await ticketsService.redeem("ABC123", { barCode: "999", method: "scan" });

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/tickets/redeem", {
      method: "POST",
      body: { code: "ABC123", barCode: "999", method: "scan" },
    });
  });
});
