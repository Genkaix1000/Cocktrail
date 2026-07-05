import { afterEach, describe, expect, it, vi } from "vitest";
import { configService, type SafeConfig } from "./config.service";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("configService", () => {
  it("get hace GET a /api/config", async () => {
    const expected = { theme: "bosko" } as SafeConfig;
    mockedApiFetch.mockResolvedValueOnce(expected);

    const result = await configService.get();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/config");
    expect(result).toBe(expected);
  });

  it("update hace POST a /api/config con el patch recibido", async () => {
    const expected = { theme: "bosko" } as SafeConfig;
    mockedApiFetch.mockResolvedValueOnce(expected);

    const result = await configService.update({ brandName: "BarQR" });

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/config", {
      method: "POST",
      body: { brandName: "BarQR" },
    });
    expect(result).toBe(expected);
  });
});
