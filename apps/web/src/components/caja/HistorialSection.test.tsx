import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HistorialSection from "./HistorialSection";
import { ordersService } from "@/services/orders.service";
import { HOLD_CONFIRM_MS } from "@/components/shared/SafeDeleteModal";

import type { Order } from "@cocktrail/shared";

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

async function holdCancelConfirm() {
  const hold = await screen.findByRole("button", { name: /Cancelar ticket\. Mantené/i });
  fireEvent.pointerDown(hold);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(HOLD_CONFIRM_MS + 100);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
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

    expect(screen.getByText("No hay tickets registrados")).toBeInTheDocument();
  });

  it("muestra los tickets en tabla con columnas de auditoría", () => {
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
    expect(screen.getByText("Efectivo")).toBeInTheDocument();
    expect(screen.queryByText("Pendiente")).not.toBeInTheDocument();
    expect(screen.getByText(/Fernet con Coca/)).toBeInTheDocument();
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

    const search = screen.getByPlaceholderText("Buscar ticket, cajero o trago…");
    await user.type(search, "2");

    expect(screen.queryByText("#001")).not.toBeInTheDocument();
    expect(screen.getByText("#002")).toBeInTheDocument();
  });

  it("permite reimprimir desde la fila", async () => {
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

    await user.click(screen.getByRole("button", { name: /reimprimir ticket 1/i }));
    expect(printer.reprintTicket).toHaveBeenCalledWith(order.id);
  });

  it("tras hold muestra toast con Deshacer y solo entonces cancela en API", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const order = makeOrder();
    const cancelled = { ...order, status: "cancelado" as const };
    mockedOrdersService.updateStatus.mockResolvedValue(cancelled);
    const onOrderUpdated = vi.fn();

    render(
      <HistorialSection
        orders={[order]}
        currentUser={adminUser}
        printer={printer}
        onOrderUpdated={onOrderUpdated}
      />,
    );

    await user.click(screen.getByRole("button", { name: /cancelar ticket #1/i }));
    expect(screen.getByText(/Cancelar #001/i)).toBeInTheDocument();
    expect(mockedOrdersService.updateStatus).not.toHaveBeenCalled();

    await holdCancelConfirm();

    expect(await screen.findByText(/Ticket cancelado/i)).toBeInTheDocument();
    expect(onOrderUpdated).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelado" }));
    expect(mockedOrdersService.updateStatus).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });
    await waitFor(() =>
      expect(mockedOrdersService.updateStatus).toHaveBeenCalledWith(order.id, "cancelado"),
    );
  });

  it("Deshacer restaura el ticket sin llamar a la API", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const order = makeOrder();
    const onOrderUpdated = vi.fn();

    render(
      <HistorialSection
        orders={[order]}
        currentUser={adminUser}
        printer={printer}
        onOrderUpdated={onOrderUpdated}
      />,
    );

    await user.click(screen.getByRole("button", { name: /cancelar ticket #1/i }));
    await holdCancelConfirm();
    expect(await screen.findByText(/Ticket cancelado/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Deshacer/i }));

    expect(onOrderUpdated).toHaveBeenLastCalledWith(order);
    expect(mockedOrdersService.updateStatus).not.toHaveBeenCalled();
  });

  it("cerrar el modal sin hold deja el icono de cancelar visible", async () => {
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

    await user.click(screen.getByRole("button", { name: /cancelar ticket #1/i }));
    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByText(/Cancelar #001/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancelar ticket #1/i })).toBeInTheDocument();
  });

  it("no muestra cancelar sin el permiso cancelarTickets", () => {
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

    expect(screen.queryByRole("button", { name: /cancelar ticket/i })).not.toBeInTheDocument();
  });
});
