import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import SistemaSection from "./SistemaSection";

vi.mock("@/services/system.service", () => ({
  systemService: {
    getVersion: vi.fn(),
  },
}));

import { systemService } from "@/services/system.service";

const mocked = vi.mocked(systemService);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getVersion.mockResolvedValue({
    version: "0.1.0",
    channel: "beta",
    label: "0.1.0-beta",
    environment: "development",
    deploy: {
      provider: "local",
      service: null,
      commit: null,
      commitShort: null,
      branch: null,
      externalUrl: null,
    },
    runtime: {
      node: "v22.0.0",
      serverStartedAt: Date.now() - 120_000,
      uptimeSec: 120,
    },
    migrations: { state: "ok", pendingCount: 0, lastApplied: null },
    releaseNotes: {
      version: "0.1.0",
      date: "2026-08-09",
      highlights: ["Panel de versión en Sistema.", "Tours de ayuda contextuales."],
    },
  });
});

describe("SistemaSection", () => {
  it("muestra el título y la descarga del APK", async () => {
    render(<SistemaSection />);
    expect(screen.getByText("Sistema")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Descargar app/i })).toHaveAttribute(
      "href",
      "/miboliche-caja.apk",
    );
    await waitFor(() => expect(mocked.getVersion).toHaveBeenCalled());
  });

  it("muestra versión beta 0.1.0, hosting local y novedades del changelog", async () => {
    render(<SistemaSection />);
    expect(await screen.findByText("v0.1.0")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.getByText("0.1.0-beta")).toBeInTheDocument();
    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.getByText("Novedades de esta versión")).toBeInTheDocument();
    expect(screen.getByText("Panel de versión en Sistema.")).toBeInTheDocument();
  });
});
