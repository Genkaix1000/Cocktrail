import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PendingOrdersList from "./PendingOrdersList";
import type { Order } from "@cocktrail/shared";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    token: "TKN-1",
    displayNumber: 7,
    items: [{ drinkId: 1, name: "Fernet con Coca", qty: 1, unitPrice: 2500, subtotal: 2500 }],
    total: 2500,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: Date.now(),
    createdBy: "barra1",
    ...overrides,
  };
}

const adminUser = { role: "admin", username: "admin1", permissions: { cancelarTickets: true } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PendingOrdersList", () => {
  it("muestra el estado vacío cuando no hay pedidos pendientes", () => {
    render(
      <PendingOrdersList
        pendingOrders={[]}
        notifications={[]}
        currentUser={adminUser}
        onSelectOrder={vi.fn()}
        onCancelClick={vi.fn()}
        onDismissNotification={vi.fn()}
      />,
    );

    expect(screen.getByText("Sin tragos pendientes")).toBeInTheDocument();
  });

  it("lista los pedidos pendientes con su estado y total", () => {
    const order = makeOrder();
    render(
      <PendingOrdersList
        pendingOrders={[order]}
        notifications={[]}
        currentUser={adminUser}
        onSelectOrder={vi.fn()}
        onCancelClick={vi.fn()}
        onDismissNotification={vi.fn()}
      />,
    );

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("$2.500")).toBeInTheDocument();
  });

  it("llama a onSelectOrder al tocar un pedido para canje manual", async () => {
    const user = userEvent.setup();
    const order = makeOrder();
    const onSelectOrder = vi.fn();

    render(
      <PendingOrdersList
        pendingOrders={[order]}
        notifications={[]}
        currentUser={adminUser}
        onSelectOrder={onSelectOrder}
        onCancelClick={vi.fn()}
        onDismissNotification={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Fernet con Coca", { exact: false }));
    expect(onSelectOrder).toHaveBeenCalledWith(order);
  });

  it("muestra el botón de cancelar solo si el usuario tiene permiso", () => {
    const order = makeOrder();
    const { rerender } = render(
      <PendingOrdersList
        pendingOrders={[order]}
        notifications={[]}
        currentUser={adminUser}
        onSelectOrder={vi.fn()}
        onCancelClick={vi.fn()}
        onDismissNotification={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Cancelar pedido")).toBeInTheDocument();

    rerender(
      <PendingOrdersList
        pendingOrders={[order]}
        notifications={[]}
        currentUser={{ role: "barman", username: "b1", permissions: { cancelarTickets: false } }}
        onSelectOrder={vi.fn()}
        onCancelClick={vi.fn()}
        onDismissNotification={vi.fn()}
      />,
    );
    expect(screen.queryByTitle("Cancelar pedido")).not.toBeInTheDocument();
  });

  it("dispara onCancelClick sin propagar el click al onSelectOrder", async () => {
    const user = userEvent.setup();
    const order = makeOrder();
    const onSelectOrder = vi.fn();
    const onCancelClick = vi.fn((_order: Order, e: React.MouseEvent) => e.stopPropagation());

    render(
      <PendingOrdersList
        pendingOrders={[order]}
        notifications={[]}
        currentUser={adminUser}
        onSelectOrder={onSelectOrder}
        onCancelClick={onCancelClick}
        onDismissNotification={vi.fn()}
      />,
    );

    await user.click(screen.getByTitle("Cancelar pedido"));
    expect(onCancelClick).toHaveBeenCalledWith(order, expect.anything());
    expect(onSelectOrder).not.toHaveBeenCalled();
  });

  it("muestra las notificaciones toast y permite descartarlas", async () => {
    const user = userEvent.setup();
    const onDismissNotification = vi.fn();

    render(
      <PendingOrdersList
        pendingOrders={[]}
        notifications={[{ id: "n1", displayNumber: 12, text: "x1 Fernet", duration: 5000 }]}
        currentUser={adminUser}
        onSelectOrder={vi.fn()}
        onCancelClick={vi.fn()}
        onDismissNotification={onDismissNotification}
      />,
    );

    expect(screen.getByText("#12")).toBeInTheDocument();
    const closeButtons = screen.getAllByRole("button");
    await user.click(closeButtons[closeButtons.length - 1]);
    expect(onDismissNotification).toHaveBeenCalledWith("n1");
  });
});
