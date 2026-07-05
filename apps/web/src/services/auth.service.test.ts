import { afterEach, describe, expect, it, vi } from "vitest";
import { authService } from "./auth.service";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("authService", () => {
  it("login hace POST a /api/auth/login con username/password/captchaAnswer", async () => {
    const expected = { username: "admin", role: "admin" };
    mockedApiFetch.mockResolvedValueOnce(expected);

    const result = await authService.login("admin", "1234", "7");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      body: { username: "admin", password: "1234", captchaAnswer: "7" },
    });
    expect(result).toBe(expected);
  });

  it("logout hace POST a /api/auth/logout", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true });

    await authService.logout();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });

  it("getMe hace GET a /api/auth/me", async () => {
    mockedApiFetch.mockResolvedValueOnce(null);

    const result = await authService.getMe();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/auth/me");
    expect(result).toBeNull();
  });
});
