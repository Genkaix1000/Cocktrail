import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DeleteNightModal from "./DeleteNightModal";
import { eventsService, type NightDeletionPreview } from "@/services/events.service";

vi.mock("@/services/events.service", () => ({
  eventsService: {
    getDeletionPreview: vi.fn(),
    deleteNight: vi.fn(),
  },
}));

const mocked = vi.mocked(eventsService);

function makePreview(overrides: Partial<NightDeletionPreview> = {}): NightDeletionPreview {
  return {
    eventId: "evt-1",
    status: "cerrado",
    fechaAr: "2026-08-07",
    keyword: "TEQUILA",
    startedAt: "2026-08-07T23:00:00.000Z",
    closedAt: "2026-08-08T06:00:00.000Z",
    pedidos: 12,
    pedidosCancelados: 1,
    totalFacturado: 48500,
    tickets: 12,
    cashSales: 0,
    cashSalesMonto: 0,
    mpOrders: 0,
    mpOrdersCobrados: 0,
    mpMontoCobrado: 0,
    mpSinEventId: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeleteNightModal", () => {
  it("muestra qué se pierde: fecha, pedidos y total facturado", async () => {
    mocked.getDeletionPreview.mockResolvedValue(makePreview());

    render(<DeleteNightModal eventId="evt-1" onClose={vi.fn()} onDeleted={vi.fn()} />);

    expect(await screen.findByText("Total facturado")).toBeInTheDocument();
    expect(screen.getByText("$48.500")).toBeInTheDocument();
    expect(screen.getByText("12 (1 cancelados)")).toBeInTheDocument();
    expect(screen.getAllByText("2026-08-07").length).toBeGreaterThanOrEqual(1);
    expect(mocked.getDeletionPreview).toHaveBeenCalledExactlyOnceWith("evt-1");
  });

  it("advierte de los cobros reales de Mercado Pago cuando los hay", async () => {
    mocked.getDeletionPreview.mockResolvedValue(
      makePreview({ mpOrders: 4, mpOrdersCobrados: 3, mpMontoCobrado: 21000 }),
    );

    render(<DeleteNightModal eventId="evt-1" onClose={vi.fn()} onDeleted={vi.fn()} />);

    expect(
      await screen.findByText(/cobros?\s*real/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("$21.000").length).toBeGreaterThanOrEqual(1);
  });

  it("aclara los cobros viejos sin noche anotada cuando los hay", async () => {
    mocked.getDeletionPreview.mockResolvedValue(
      makePreview({
        mpOrders: 4,
        mpOrdersCobrados: 3,
        mpMontoCobrado: 21000,
        mpSinEventId: 2,
      }),
    );

    render(<DeleteNightModal eventId="evt-1" onClose={vi.fn()} onDeleted={vi.fn()} />);

    expect(
      await screen.findByText(/2 de esos cobros son viejos/i),
    ).toBeInTheDocument();
  });

  it("no muestra la advertencia de Mercado Pago si no hubo cobros", async () => {
    mocked.getDeletionPreview.mockResolvedValue(makePreview());

    render(<DeleteNightModal eventId="evt-1" onClose={vi.fn()} onDeleted={vi.fn()} />);

    await screen.findByText("Total facturado");
    expect(screen.queryByText(/cobros?\s*real/i)).not.toBeInTheDocument();
  });

  it("el botón de borrar se habilita solo con la fecha Y la contraseña", async () => {
    const user = userEvent.setup();
    mocked.getDeletionPreview.mockResolvedValue(makePreview());

    render(<DeleteNightModal eventId="evt-1" onClose={vi.fn()} onDeleted={vi.fn()} />);

    await screen.findByText("Total facturado");
    const confirm = screen.getByRole("button", { name: /Borrar la noche/i });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/Escribí la fecha/i), "2026-08-07");
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/contraseña/i), "hunter2");
    expect(confirm).toBeEnabled();
  });

  it("solo con la contraseña (sin fecha) sigue deshabilitado", async () => {
    const user = userEvent.setup();
    mocked.getDeletionPreview.mockResolvedValue(makePreview());

    render(<DeleteNightModal eventId="evt-1" onClose={vi.fn()} onDeleted={vi.fn()} />);

    await screen.findByText("Total facturado");
    await user.type(screen.getByLabelText(/contraseña/i), "hunter2");

    expect(screen.getByRole("button", { name: /Borrar la noche/i })).toBeDisabled();
  });

  it("confirma con fecha + contraseña y avisa al padre", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const onClose = vi.fn();
    mocked.getDeletionPreview.mockResolvedValue(makePreview());
    mocked.deleteNight.mockResolvedValue({
      ...makePreview(),
      borrado: { orders: 12, tickets: 12, cashSales: 0, mpOrders: 0, webhooksNeutralizados: 0, mpOrdersDesligados: 0 },
      operator: "manuel",
    });

    render(<DeleteNightModal eventId="evt-1" onClose={onClose} onDeleted={onDeleted} />);

    await screen.findByText("Total facturado");
    await user.type(screen.getByLabelText(/Escribí la fecha/i), "2026-08-07");
    await user.type(screen.getByLabelText(/contraseña/i), "hunter2");
    await user.click(screen.getByRole("button", { name: /Borrar la noche/i }));

    await waitFor(() =>
      expect(mocked.deleteNight).toHaveBeenCalledExactlyOnceWith(
        "evt-1",
        "2026-08-07",
        "hunter2",
      ),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("muestra el error del server (fecha o contraseña incorrecta) sin cerrar el modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mocked.getDeletionPreview.mockResolvedValue(makePreview());
    mocked.deleteNight.mockRejectedValue(new Error("La fecha no coincide con la noche"));

    render(<DeleteNightModal eventId="evt-1" onClose={onClose} onDeleted={vi.fn()} />);

    await screen.findByText("Total facturado");
    await user.type(screen.getByLabelText(/Escribí la fecha/i), "2026-08-06");
    await user.type(screen.getByLabelText(/contraseña/i), "hunter2");
    await user.click(screen.getByRole("button", { name: /Borrar la noche/i }));

    expect(await screen.findByText("La fecha no coincide con la noche")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("muestra el error de carga del preview y no ofrece confirmar", async () => {
    mocked.getDeletionPreview.mockRejectedValue(new Error("Noche inexistente"));

    render(<DeleteNightModal eventId="evt-1" onClose={vi.fn()} onDeleted={vi.fn()} />);

    expect(await screen.findByText("Noche inexistente")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Borrar la noche/i })).not.toBeInTheDocument();
  });
});
