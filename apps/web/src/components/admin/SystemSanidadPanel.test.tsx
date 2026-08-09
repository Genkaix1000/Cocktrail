import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SystemSanidadPanel from "./SystemSanidadPanel";
import { systemService } from "@/services/system.service";
import { mercadopagoService } from "@/services/mercadopago.service";

vi.mock("@/services/system.service", () => ({
  systemService: {
    getHealth: vi.fn(),
    acceptMigrationDrift: vi.fn(),
  },
}));

vi.mock("@/services/mercadopago.service", () => ({
  mercadopagoService: {
    getSellerStatus: vi.fn(),
  },
}));

const mockedSystem = vi.mocked(systemService);
const mockedMp = vi.mocked(mercadopagoService);

describe("SystemSanidadPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSystem.getHealth.mockResolvedValue({
      status: "ok",
      migrations: {
        state: "ok",
        lastRunAt: null,
        appliedNow: [],
        pending: [],
        failed: null,
        drift: [],
      },
      serverStartedAt: Date.now(),
    });
    mockedMp.getSellerStatus.mockResolvedValue({
      linked: true,
      status: "active",
      nickname: "test",
      email: null,
      linkedAt: null,
      displayName: "Test",
    });
  });

  it("cuando todo OK muestra mensaje discreto", async () => {
    render(<SystemSanidadPanel />);
    expect(await screen.findByText(/Todo funciona correctamente/i)).toBeInTheDocument();
  });

  it("sin MP vinculada muestra crítico e Ir a Pagos", async () => {
    const onGoToPagos = vi.fn();
    mockedMp.getSellerStatus.mockResolvedValue({
      linked: false,
      status: null,
      nickname: null,
      email: null,
      linkedAt: null,
      displayName: null,
    });

    render(<SystemSanidadPanel onGoToPagos={onGoToPagos} />);
    expect(await screen.findByText(/No hay cuenta de Mercado Pago vinculada/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Ir a Pagos/i }));
    expect(onGoToPagos).toHaveBeenCalled();
  });

  it("con drift muestra Aceptar cambios y llama al endpoint", async () => {
    mockedSystem.getHealth.mockResolvedValue({
      status: "degraded",
      migrations: {
        state: "degraded",
        lastRunAt: null,
        appliedNow: [],
        pending: [],
        failed: null,
        drift: [{ version: "a.sql", expected: "x", actual: "y" }],
      },
      serverStartedAt: Date.now(),
    });
    mockedSystem.acceptMigrationDrift.mockResolvedValue({ updated: 1, versions: ["a.sql"] });

    render(<SystemSanidadPanel />);
    expect(await screen.findByText(/migración ya aplicada/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Aceptar cambios/i }));
    await waitFor(() => expect(mockedSystem.acceptMigrationDrift).toHaveBeenCalledTimes(1));
  });
});
