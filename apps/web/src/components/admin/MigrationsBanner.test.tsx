import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { MigrationsBanner } from "./MigrationsBanner";
import { systemService, type SystemHealth } from "@/services/system.service";

vi.mock("@/services/system.service", () => ({
  systemService: {
    getHealth: vi.fn(),
  },
}));

const mockedSystemService = vi.mocked(systemService);

function makeHealth(overrides: Partial<SystemHealth["migrations"]> = {}): SystemHealth {
  const migrations: SystemHealth["migrations"] = {
    state: "ok",
    lastRunAt: "2026-07-21T00:00:00.000Z",
    appliedNow: [],
    pending: [],
    failed: null,
    drift: [],
    ...overrides,
  };
  const degraded =
    migrations.failed !== null || migrations.pending.length > 0 || migrations.drift.length > 0;
  return {
    status: degraded ? "degraded" : "ok",
    migrations,
    serverStartedAt: 1750000000000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MigrationsBanner", () => {
  it("no renderiza nada cuando el estado es ok", async () => {
    mockedSystemService.getHealth.mockResolvedValue(makeHealth());

    const { container } = render(<MigrationsBanner />);

    await waitFor(() => expect(mockedSystemService.getHealth).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("no renderiza nada si el backend no responde (eso lo cubren otros mecanismos)", async () => {
    mockedSystemService.getHealth.mockRejectedValue(new Error("fetch failed"));

    const { container } = render(<MigrationsBanner />);

    await waitFor(() => expect(mockedSystemService.getHealth).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("muestra el banner de migración fallida con role=alert", async () => {
    mockedSystemService.getHealth.mockResolvedValue(
      makeHealth({
        state: "degraded",
        failed: { version: "20260101000000_boom.sql", error: "syntax error" },
        pending: ["20260102000000_next.sql"],
      }),
    );

    render(<MigrationsBanner />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Actualización de base de datos incompleta");
    expect(alert).toHaveTextContent("20260101000000_boom.sql");
    expect(alert).toHaveTextContent("1 pendiente");
  });

  it("no muestra banner cuando solo hay drift (va al panel Sanidad del Dashboard)", async () => {
    mockedSystemService.getHealth.mockResolvedValue(
      makeHealth({
        state: "degraded",
        drift: [{ version: "20260101000000_a.sql", expected: "x", actual: "y" }],
      }),
    );

    const { container } = render(<MigrationsBanner />);
    await vi.waitFor(() => {
      expect(mockedSystemService.getHealth).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
