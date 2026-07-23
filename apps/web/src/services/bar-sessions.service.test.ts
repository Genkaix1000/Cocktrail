import { afterEach, describe, expect, it, vi } from "vitest";
import { barSessionsService } from "./bar-sessions.service";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/bar-context", () => ({
  setActiveBarContext: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

// D6: la identidad la deriva el backend de la cookie de sesión — ninguna
// llamada manda deviceId (ni por header ni por body).
describe("barSessionsService", () => {
  it("listOptions hace GET sin header X-Device-Id", async () => {
    mockedApiFetch.mockResolvedValueOnce({ boxes: [], currentSession: null });

    await barSessionsService.listOptions();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/bar-sessions/options", {
      signal: undefined,
    });
    const options = mockedApiFetch.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(options?.headers).toBeUndefined();
  });

  it("join manda solo el barId (sin deviceId)", async () => {
    mockedApiFetch.mockResolvedValueOnce({ joined: true, session: {} });

    await barSessionsService.join("bar-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/bar-sessions/join", {
      method: "POST",
      body: { barId: "bar-1" },
    });
  });

  it("leave hace DELETE sin body", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true });

    await barSessionsService.leave();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/bar-sessions/leave", {
      method: "DELETE",
    });
  });

  it("heartbeat hace POST sin body", async () => {
    mockedApiFetch.mockResolvedValueOnce({});

    await barSessionsService.heartbeat();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/bar-sessions/heartbeat", {
      method: "POST",
    });
  });

  it("listAll hace GET a /api/bar-sessions", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);

    await barSessionsService.listAll();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/bar-sessions", { signal: undefined });
  });

  it("forceLogout manda el barId a echar", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true });

    await barSessionsService.forceLogout("bar-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/bar-sessions/force-logout", {
      method: "POST",
      body: { barId: "bar-1" },
    });
  });
});
