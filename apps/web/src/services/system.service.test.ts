import { afterEach, describe, expect, it, vi } from "vitest";
import { systemService } from "./system.service";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("systemService.restore", () => {
  it("hace POST a /api/system/restore con la contraseña", async () => {
    const expected = {
      nightEvents: { ok: 3, failed: 0 },
      orders: { ok: 10, failed: 0 },
      tickets: { ok: 10, failed: 0 },
      cashSales: { ok: 2, failed: 0 },
      auditLogs: { ok: 5, failed: 0 },
    };
    mockedApiFetch.mockResolvedValueOnce(expected);

    const result = await systemService.restore("mi-clave");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/system/restore", {
      method: "POST",
      body: { password: "mi-clave" },
    });
    expect(result).toBe(expected);
  });
});
