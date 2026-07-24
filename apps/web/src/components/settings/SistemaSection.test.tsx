import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SistemaSection from "./SistemaSection";
import { systemService, type RestoreResult } from "@/services/system.service";
import { ApiError } from "@/services/api-client";

vi.mock("@/services/system.service", () => ({
  systemService: {
    restore: vi.fn(),
  },
}));

const mockedSystemService = vi.mocked(systemService);

function makeResult(overrides: Partial<RestoreResult> = {}): RestoreResult {
  return {
    nightEvents: { ok: 3, failed: 0 },
    mpCajas: { ok: 1, failed: 0 },
    mpDevices: { ok: 2, failed: 0 },
    mpOrders: { ok: 7, failed: 0 },
    orders: { ok: 10, failed: 0 },
    tickets: { ok: 10, failed: 0 },
    auditLogs: { ok: 5, failed: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SistemaSection", () => {
  it("muestra el título y el botón de restore, sin modal abierto inicialmente", () => {
    render(<SistemaSection />);
    expect(screen.getByText("Sistema")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Restaurar desde backup/i })).toBeInTheDocument();
    expect(screen.queryByText(/Tu contraseña/i)).not.toBeInTheDocument();
  });

  it("al apretar el botón, abre el modal de confirmación con contraseña", async () => {
    const user = userEvent.setup();
    render(<SistemaSection />);

    await user.click(screen.getByRole("button", { name: /Restaurar desde backup/i }));

    expect(screen.getByText(/Tu contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("con contraseña y confirmación, llama a systemService.restore y muestra el resultado tabla por tabla", async () => {
    const user = userEvent.setup();
    mockedSystemService.restore.mockResolvedValue(makeResult());
    render(<SistemaSection />);

    await user.click(screen.getByRole("button", { name: /Restaurar desde backup/i }));
    await user.type(screen.getByPlaceholderText("Ingresá tu contraseña para confirmar"), "admin123");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(mockedSystemService.restore).toHaveBeenCalledWith("admin123"));
    expect(await screen.findByText("Restore completado sin errores.")).toBeInTheDocument();
    expect(screen.getByText("Noches")).toBeInTheDocument();
    expect(screen.getByText("3 ok")).toBeInTheDocument();

    // El modal se cierra tras confirmar con éxito
    expect(screen.queryByText(/Tu contraseña/i)).not.toBeInTheDocument();
  });

  it("renderiza las filas MP del restore (cajas, posnets y cobros)", async () => {
    const user = userEvent.setup();
    mockedSystemService.restore.mockResolvedValue(makeResult());
    render(<SistemaSection />);

    await user.click(screen.getByRole("button", { name: /Restaurar desde backup/i }));
    await user.type(screen.getByPlaceholderText("Ingresá tu contraseña para confirmar"), "admin123");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText("Cajas MP")).toBeInTheDocument();
    expect(screen.getByText("Posnets")).toBeInTheDocument();
    expect(screen.getByText("Cobros MP")).toBeInTheDocument();
    expect(screen.getByText("7 ok")).toBeInTheDocument();
  });

  it("tras el restore, avisa que los tokens de MP no se restauran y hay que re-vincular por OAuth", async () => {
    const user = userEvent.setup();
    mockedSystemService.restore.mockResolvedValue(makeResult());
    render(<SistemaSection />);

    await user.click(screen.getByRole("button", { name: /Restaurar desde backup/i }));
    await user.type(screen.getByPlaceholderText("Ingresá tu contraseña para confirmar"), "admin123");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(
      await screen.findByText(/Volvé a vincular la cuenta de MP por OAuth desde la tarjeta de Pagos/i),
    ).toBeInTheDocument();
  });

  it("si alguna tabla falla, muestra el toast de error y el detalle de esa tabla", async () => {
    const user = userEvent.setup();
    mockedSystemService.restore.mockResolvedValue(
      makeResult({ orders: { ok: 8, failed: 2, error: "Pedidos no restaurados: la noche asociada no llegó de cloud" } }),
    );
    render(<SistemaSection />);

    await user.click(screen.getByRole("button", { name: /Restaurar desde backup/i }));
    await user.type(screen.getByPlaceholderText("Ingresá tu contraseña para confirmar"), "admin123");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText(/algunas tablas con error/i)).toBeInTheDocument();
    expect(screen.getByText(/la noche asociada no llegó de cloud/)).toBeInTheDocument();
    expect(screen.getByText("8 ok / 2 fallaron")).toBeInTheDocument();
  });

  it("si la contraseña es incorrecta (401), muestra el error dentro del modal sin cerrarlo", async () => {
    const user = userEvent.setup();
    mockedSystemService.restore.mockRejectedValue(new ApiError(401, "Contraseña incorrecta."));
    render(<SistemaSection />);

    await user.click(screen.getByRole("button", { name: /Restaurar desde backup/i }));
    await user.type(screen.getByPlaceholderText("Ingresá tu contraseña para confirmar"), "mal");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText("Contraseña incorrecta.")).toBeInTheDocument();
    // El modal sigue abierto para reintentar
    expect(screen.getByPlaceholderText("Ingresá tu contraseña para confirmar")).toBeInTheDocument();
  });

  it("cancelar cierra el modal sin llamar a restore", async () => {
    const user = userEvent.setup();
    render(<SistemaSection />);

    await user.click(screen.getByRole("button", { name: /Restaurar desde backup/i }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByText(/Tu contraseña/i)).not.toBeInTheDocument();
    expect(mockedSystemService.restore).not.toHaveBeenCalled();
  });
});
