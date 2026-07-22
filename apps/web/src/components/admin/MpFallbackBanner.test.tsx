import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { MpFallbackBanner } from "./MpFallbackBanner";
import { systemService, type MpFallbackHealth, type SystemHealth } from "@/services/system.service";
import { pdvService } from "@/services/pdv.service";

vi.mock("@/services/system.service", () => ({
  systemService: {
    getHealth: vi.fn(),
  },
}));

vi.mock("@/services/pdv.service", () => ({
  pdvService: {
    listDevices: vi.fn(),
  },
}));

const mockedSystemService = vi.mocked(systemService);
const mockedPdvService = vi.mocked(pdvService);

function makeHealth(mpFallback?: MpFallbackHealth): SystemHealth {
  return {
    status: "ok",
    migrations: {
      state: "ok",
      lastRunAt: "2026-07-21T00:00:00.000Z",
      appliedNow: [],
      pending: [],
      failed: null,
      drift: [],
    },
    serverStartedAt: 1750000000000,
    ...(mpFallback ? { mpFallback } : {}),
  };
}

function makeFallback(overrides: Partial<MpFallbackHealth> = {}): MpFallbackHealth {
  return {
    status: "unusable",
    reason: "el token pertenece a otra cuenta (user_id 999)",
    checkedAt: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}

const POSNET = {
  id: "dev-1",
  cajaId: null,
  deviceId: "PAX_A910__SMARTPOS1494025317",
  deviceUsername: "Caja 1",
  operatingMode: "PDV",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedPdvService.listDevices.mockResolvedValue([POSNET]);
});

describe("MpFallbackBanner", () => {
  it("muestra el banner con role=alert y la razón cuando el fallback es unusable", async () => {
    mockedSystemService.getHealth.mockResolvedValue(makeHealth(makeFallback()));

    render(<MpFallbackBanner />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("El token de emergencia de Mercado Pago no es utilizable");
    expect(alert).toHaveTextContent("el token pertenece a otra cuenta (user_id 999)");
    expect(alert).toHaveTextContent("la caja no va a poder cobrar con Posnet");
  });

  it("no renderiza nada cuando el fallback es usable", async () => {
    mockedSystemService.getHealth.mockResolvedValue(makeHealth(makeFallback({ status: "usable", reason: undefined })));

    const { container } = render(<MpFallbackBanner />);

    await waitFor(() => expect(mockedSystemService.getHealth).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("no renderiza nada cuando el fallback es unknown", async () => {
    mockedSystemService.getHealth.mockResolvedValue(makeHealth(makeFallback({ status: "unknown" })));

    const { container } = render(<MpFallbackBanner />);

    await waitFor(() => expect(mockedSystemService.getHealth).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("no renderiza nada si el health no trae mpFallback (backend viejo)", async () => {
    mockedSystemService.getHealth.mockResolvedValue(makeHealth());

    const { container } = render(<MpFallbackBanner />);

    await waitFor(() => expect(mockedSystemService.getHealth).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("no renderiza nada si no hay ningún Posnet registrado", async () => {
    mockedSystemService.getHealth.mockResolvedValue(makeHealth(makeFallback()));
    mockedPdvService.listDevices.mockResolvedValue([]);

    const { container } = render(<MpFallbackBanner />);

    await waitFor(() => expect(mockedPdvService.listDevices).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("muestra el banner igual si la consulta de Posnets falla (no callar la advertencia)", async () => {
    mockedSystemService.getHealth.mockResolvedValue(makeHealth(makeFallback()));
    mockedPdvService.listDevices.mockRejectedValue(new Error("fetch failed"));

    render(<MpFallbackBanner />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
