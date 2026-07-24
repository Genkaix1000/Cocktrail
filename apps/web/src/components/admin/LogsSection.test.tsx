import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LogsSection from "./LogsSection";
import { ordersService } from "@/services/orders.service";

import type { Order } from "@cocktrail/shared";

// LogsSection hace su propio fetch (a diferencia de HistorialSection),
// así que mockeamos ordersService en vez de reutilizar un hook real.
vi.mock("@/services/orders.service", () => ({
  ordersService: {
    getAuditLogs: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

const mockedOrdersService = vi.mocked(ordersService);

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    token: "TKN-1",
    displayNumber: 1,
    items: [{ drinkId: 1, name: "Fernet con Coca", qty: 2, unitPrice: 2500, subtotal: 5000 }],
    total: 5000,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: Date.now(),
    createdBy: "cajera1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LogsSection", () => {
  it("renderiza sin crashear y muestra el estado de carga inicial", async () => {
    mockedOrdersService.getAuditLogs.mockResolvedValue([]);

    render(<LogsSection isBosko={false} />);

    expect(screen.getByText("Auditoría de Tickets")).toBeInTheDocument();
    await waitFor(() => expect(mockedOrdersService.getAuditLogs).toHaveBeenCalledWith(false));
  });

  it("muestra el estado vacío cuando no hay tickets registrados", async () => {
    mockedOrdersService.getAuditLogs.mockResolvedValue([]);

    render(<LogsSection isBosko={false} />);

    expect(
      await screen.findByText("No hay tickets registrados en el historial"),
    ).toBeInTheDocument();
  });

  it("cancela un ticket tras confirmar el texto exacto", async () => {
    const user = userEvent.setup();
    const order = makeOrder();
    const cancelledOrder: Order = { ...order, status: "cancelado", cancelledBy: "cajera1" };

    mockedOrdersService.getAuditLogs.mockResolvedValue([order]);
    mockedOrdersService.updateStatus.mockResolvedValue(cancelledOrder);

    render(<LogsSection isBosko={false} />);

    // Abre el detalle del ticket haciendo click en la fila.
    const ticketCell = await screen.findByText("#1");
    await user.click(ticketCell);

    // Inicia el flujo de cancelación.
    const cancelButton = await screen.findByRole("button", { name: /Cancelar Ticket/i });
    await user.click(cancelButton);

    const input = screen.getByPlaceholderText("Escribir aquí...");
    await user.type(input, "cancelar");

    const confirmButton = screen.getByRole("button", { name: /Confirmar/i });
    await user.click(confirmButton);

    await waitFor(() =>
      expect(mockedOrdersService.updateStatus).toHaveBeenCalledWith(order.id, "cancelado"),
    );
  });

  it("precarga el filtro de mes/día cuando llega un initialFilterTimestamp (redirect desde Historial)", async () => {
    const ts = new Date(2026, 5, 15, 22, 30).getTime(); // 15/06/2026
    const orderThatNight = makeOrder({ id: "order-night", createdAt: ts, displayNumber: 7 });

    mockedOrdersService.getAuditLogs.mockResolvedValue([orderThatNight]);

    render(<LogsSection isBosko={false} initialFilterTimestamp={ts} />);

    // El redirect desde Historial siempre pide "todas las noches", no solo la actual.
    await waitFor(() => expect(mockedOrdersService.getAuditLogs).toHaveBeenCalledWith(true));

    // El ticket de esa noche aparece ya filtrado sin tocar ningún selector.
    expect(await screen.findByText("#7")).toBeInTheDocument();
  });
});
