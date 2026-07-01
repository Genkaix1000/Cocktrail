import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HistorialSection from "./HistorialSection";
import { ordersService } from "@/services/orders.service";

import type { Order } from "@cocktrail/shared";

// HistorialSection cancela tickets vía ordersService.updateStatus — se
// mockea para no pegarle a la API real.
vi.mock("@/services/orders.service", () => ({
  ordersService: {
    updateStatus: vi.fn(),
  },
}));

const mockedOrdersService = vi.mocked(ordersService);

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    token: "TKN-1",
    displayNumber: 1,
    items: [{ drinkId: 1, name: "Fernet con Coca", qty: 1, unitPrice: 2500, subtotal: 2500 }],
    total: 2500,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: Date.now(),
    createdBy: "cajera1",
    ...overrides,
  };
}

const adminUser = {
  role: "admin",
  permissions: { cancelarTickets: true },
};

const printer = {
  reprintTicket: vi.fn(),
  printError: null as string | null,
  reprinting: false,
};

const noopOnOrderUpdated = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HistorialSection", () => {
  it("muestra el estado vacío cuando no hay tickets", () => {
    render(
      <HistorialSection
        orders={[]}
        currentUser={adminUser}
        printer={printer}
        onOrderUpdated={noopOnOrderUpdated}
      />,
    );

    expect(screen.getByText("— No hay tickets registrados en el historial —")).toBeInTheDocument();
  });

  it("agrupa los tickets por día y los muestra en la grilla", () => {
    const order = makeOrder();
    render(
      <HistorialSection
        orders={[order]}
        currentUser={adminUser}
        printer={printer}
        onOrderUpdated={noopOnOrderUpdated}
      />,
    );

    expect(screen.getByText("#001")).toBeInTheDocument();
  });

  it("filtra los tickets con el buscador", async () => {
    const user = userEvent.setup();
    const orderA = makeOrder({ id: "a", displayNumber: 1, createdBy: "cajera1" });
    const orderB = makeOrder({ id: "b", displayNumber: 2, createdBy: "cajera2" });

    render(
      <HistorialSection
        orders={[orderA, orderB]}
        currentUser={adminUser}
        printer={printer}
        onOrderUpdated={noopOnOrderUpdated}
      />,
    );

    expect(screen.getByText("#001")).toBeInTheDocument();
    expect(screen.getByText("#002")).toBeInTheDocument();

    const search = screen.getByPlaceholderText("Buscar por número de ticket o cajero...");
    await user.type(search, "2");

    expect(screen.queryByText("#001")).not.toBeInTheDocument();
    expect(screen.getByText("#002")).toBeInTheDocument();
  });

  it("abre el popup de detalle y permite reimprimir el ticket", async () => {
    const user = userEvent.setup();
    const order = makeOrder();

    render(
      <HistorialSection
        orders={[order]}
        currentUser={adminUser}
        printer={printer}
        onOrderUpdated={noopOnOrderUpdated}
      />,
    );

    await user.click(screen.getByText("#001"));

    expect(screen.getByText("Ticket #001")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reimprimir ticket/i }));
    expect(printer.reprintTicket).toHaveBeenCalledWith(order.id);
  });

  it("cancela un ticket cuando el usuario tiene permiso", async () => {
    const user = userEvent.setup();
    const order = makeOrder();
    const cancelled = { ...order, status: "cancelado" as const };
    mockedOrdersService.updateStatus.mockResolvedValue(cancelled);
    const onOrderUpdated = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <HistorialSection
        orders={[order]}
        currentUser={adminUser}
        printer={printer}
        onOrderUpdated={onOrderUpdated}
      />,
    );

    await user.click(screen.getByText("#001"));
    await user.click(screen.getByRole("button", { name: /cancelar ticket/i }));

    await waitFor(() => expect(mockedOrdersService.updateStatus).toHaveBeenCalledWith(order.id, "cancelado"));
    expect(onOrderUpdated).toHaveBeenCalledWith(cancelled);
  });

  it("no muestra el botón de cancelar sin el permiso cancelarTickets", async () => {
    const user = userEvent.setup();
    const order = makeOrder();
    const cajeraSinPermiso = { role: "caja", permissions: { cancelarTickets: false } };

    render(
      <HistorialSection
        orders={[order]}
        currentUser={cajeraSinPermiso}
        printer={printer}
        onOrderUpdated={noopOnOrderUpdated}
      />,
    );

    await user.click(screen.getByText("#001"));
    expect(screen.queryByRole("button", { name: /cancelar ticket/i })).not.toBeInTheDocument();
  });
});
