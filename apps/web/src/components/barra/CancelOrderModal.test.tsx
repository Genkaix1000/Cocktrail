import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CancelOrderModal from "./CancelOrderModal";
import { ordersService } from "@/services/orders.service";
import type { Order } from "@cocktrail/shared";

// CancelOrderModal cancela tickets vía ordersService.updateStatus — se mockea
// para no pegarle a la API real.
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
    displayNumber: 3,
    items: [{ drinkId: 1, name: "Fernet con Coca", qty: 1, unitPrice: 2500, subtotal: 2500 }],
    total: 2500,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: Date.now(),
    createdBy: "barra1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CancelOrderModal", () => {
  it("arranca en el paso de confirmación", () => {
    render(
      <CancelOrderModal order={makeOrder()} onClose={vi.fn()} onConfirmed={vi.fn()} triggerFlash={vi.fn()} />,
    );

    expect(screen.getByText("¿Cancelar este ticket?")).toBeInTheDocument();
    expect(screen.getByText("Pedido #3")).toBeInTheDocument();
  });

  it("llama a onClose al volver desde el paso de confirmación", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CancelOrderModal order={makeOrder()} onClose={onClose} onConfirmed={vi.fn()} triggerFlash={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("avanza al paso de motivo y requiere elegir uno para confirmar", async () => {
    const user = userEvent.setup();
    render(
      <CancelOrderModal order={makeOrder()} onClose={vi.fn()} onConfirmed={vi.fn()} triggerFlash={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getByText("Motivo de la cancelación")).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", { name: /confirmar cancelación/i });
    expect(confirmButton).toBeDisabled();

    await user.click(screen.getByText("No podía canjearlo"));
    expect(confirmButton).toBeEnabled();
  });

  it("cancela el ticket y llama a onConfirmed con el motivo elegido", async () => {
    const user = userEvent.setup();
    const order = makeOrder();
    mockedOrdersService.updateStatus.mockResolvedValue({ ...order, status: "cancelado" });
    const onConfirmed = vi.fn();
    const triggerFlash = vi.fn();

    render(
      <CancelOrderModal order={order} onClose={vi.fn()} onConfirmed={onConfirmed} triggerFlash={triggerFlash} />,
    );

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByText("Otro motivo"));
    await user.click(screen.getByRole("button", { name: /confirmar cancelación/i }));

    await waitFor(() => expect(mockedOrdersService.updateStatus).toHaveBeenCalledWith(order.id, "cancelado"));
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(triggerFlash).toHaveBeenCalledWith(
      expect.objectContaining({ type: "duplicate", message: expect.stringContaining("Otro") }),
    );
  });

  it("muestra un flash de error si la cancelación falla", async () => {
    const user = userEvent.setup();
    const order = makeOrder();
    mockedOrdersService.updateStatus.mockRejectedValue(new Error("Error al cancelar ticket"));
    const onConfirmed = vi.fn();
    const triggerFlash = vi.fn();

    render(
      <CancelOrderModal order={order} onClose={vi.fn()} onConfirmed={onConfirmed} triggerFlash={triggerFlash} />,
    );

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await user.click(screen.getByText("No se canceló"));
    await user.click(screen.getByRole("button", { name: /confirmar cancelación/i }));

    await waitFor(() => expect(triggerFlash).toHaveBeenCalledWith({ type: "error", message: "Error al cancelar ticket" }));
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
