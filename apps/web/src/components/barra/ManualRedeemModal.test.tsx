import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ManualRedeemModal from "./ManualRedeemModal";
import type { Order } from "@cocktrail/shared";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    token: "TKN-1",
    ticketCode: "ABCD1234-a1b2c3d4",
    displayNumber: 9,
    items: [{ drinkId: 1, name: "Fernet con Coca", qty: 2, unitPrice: 2500, subtotal: 5000 }],
    total: 5000,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: Date.now(),
    createdBy: "barra1",
    ...overrides,
  };
}

describe("ManualRedeemModal", () => {
  it("muestra el pedido, su estado y su total", () => {
    render(
      <ManualRedeemModal order={makeOrder()} barCode="BARRA-01" redeeming={false} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );

    expect(screen.getByText("Pedido #9")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("$5.000")).toBeInTheDocument();
    expect(screen.getByText(/Se registrará como entrega manual desde BARRA-01/)).toBeInTheDocument();
  });

  it("llama a onConfirm al confirmar el canje", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ManualRedeemModal order={makeOrder()} barCode="BARRA-01" redeeming={false} onClose={vi.fn()} onConfirm={onConfirm} />,
    );

    await user.click(screen.getByRole("button", { name: /confirmar canje/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("llama a onClose al cancelar", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ManualRedeemModal order={makeOrder()} barCode="BARRA-01" redeeming={false} onClose={onClose} onConfirm={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("deshabilita los botones y muestra el estado de carga mientras canjea", () => {
    render(
      <ManualRedeemModal order={makeOrder()} barCode="BARRA-01" redeeming onClose={vi.fn()} onConfirm={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: /canjeando/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });
});
