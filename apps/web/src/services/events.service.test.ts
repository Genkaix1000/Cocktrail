import { afterEach, describe, expect, it, vi } from "vitest";
import { eventsService } from "./events.service";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("eventsService", () => {
  it("getState hace GET a /api/state", async () => {
    mockedApiFetch.mockResolvedValueOnce({});

    await eventsService.getState();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/state");
  });

  it("closeEvent hace POST a /api/event/close con el password", async () => {
    mockedApiFetch.mockResolvedValueOnce({});

    await eventsService.closeEvent("secreto");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/event/close", {
      method: "POST",
      body: { password: "secreto" },
    });
  });

  it("openEvent hace POST a /api/events/open con la keyword", async () => {
    mockedApiFetch.mockResolvedValueOnce({});

    await eventsService.openEvent("noche-latina");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/events/open", {
      method: "POST",
      body: { keyword: "noche-latina" },
    });
  });

  it("setKeyword hace PATCH a /api/events/current/keyword", async () => {
    mockedApiFetch.mockResolvedValueOnce({});

    await eventsService.setKeyword("nueva-keyword");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/events/current/keyword", {
      method: "PATCH",
      body: { keyword: "nueva-keyword" },
    });
  });

  it("setTheme hace POST a /api/theme con el theme", async () => {
    mockedApiFetch.mockResolvedValueOnce({ success: true, theme: "bosko" });

    await eventsService.setTheme("bosko");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/theme", {
      method: "POST",
      body: { theme: "bosko" },
    });
  });

  it("getHistory hace GET a /api/events/history", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);

    await eventsService.getHistory();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/events/history");
  });

  it("getPublicConfig hace GET a /api/theme", async () => {
    mockedApiFetch.mockResolvedValueOnce({ theme: "bosko", customTheme: null, eventStartedAt: 0 });

    await eventsService.getPublicConfig();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/theme");
  });
});
