import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import Ticket from "./Ticket";
import { drinksService } from "@/services/drinks.service";
import { STATUS_META } from "@/lib/orderStatus";
import type { Order } from "@cocktrail/shared";

// Ticket pide la lista de drinks solo para resolver el ícono de cada item;
// no depende de ningún otro estado global (ver fix: se sacó un useTheme()
// muerto que forzaba innecesariamente un ThemeProvider en el árbol).
vi.mock("@/services/drinks.service", () => ({
  drinksService: {
    list: vi.fn(),
  },
}));

const mockedDrinksService = vi.mocked(drinksService);

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    token: "TKN-1",
    displayNumber: 7,
    items: [
      { drinkId: 1, name: "Fernet con Coca", qty: 2, unitPrice: 2500, subtotal: 5000 },
    ],
    total: 5000,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: new Date(2026, 5, 15, 23, 30).getTime(),
    ticketCode: "ABC123",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedDrinksService.list.mockResolvedValue([]);
});

describe("Ticket", () => {
  it("renderiza el código de barras y el ticketCode cuando el pedido ya lo tiene asignado", async () => {
    render(<Ticket order={makeOrder({ ticketCode: "XYZ987" })} />);

    expect(await screen.findByText("XYZ987")).toBeInTheDocument();
  });

  it("muestra el mensaje de espera cuando el pedido todavía no tiene ticketCode", () => {
    render(<Ticket order={makeOrder({ ticketCode: undefined })} />);

    expect(screen.getByText("Generando código…")).toBeInTheDocument();
  });

  it("lista los items del pedido con cantidad y nombre, en el ticket y en el recibo", async () => {
    render(
      <Ticket
        order={makeOrder({
          items: [
            { drinkId: 1, name: "Fernet con Coca", qty: 2, unitPrice: 2500, subtotal: 5000 },
            { drinkId: 2, name: "Gin Tonic", qty: 1, unitPrice: 3000, subtotal: 3000 },
          ],
          total: 8000,
        })}
      />
    );

    expect(await screen.findAllByText("Fernet con Coca")).toHaveLength(2); // ticket + recibo
    expect(screen.getAllByText("Gin Tonic")).toHaveLength(2);
    expect(screen.getAllByText("x2").length).toBeGreaterThan(0);
    expect(screen.getByText("$8.000")).toBeInTheDocument();
  });

  it("muestra el número de ticket y el estado 'pendiente' en el footer", () => {
    render(<Ticket order={makeOrder({ status: "pendiente", displayNumber: 42 })} />);

    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText(STATUS_META.pendiente.short.toUpperCase())).toBeInTheDocument();
  });

  it("muestra el sello 'Entregado' cuando el status es entregado", () => {
    render(<Ticket order={makeOrder({ status: "entregado" })} />);

    expect(screen.getByText("Entregado")).toBeInTheDocument();
    expect(screen.getByText("ENTREGADO")).toBeInTheDocument();
    // El CTA de "hacer otro pedido" solo aparece en estados terminales.
    expect(screen.getByRole("link", { name: /Hacer otro pedido/i })).toBeInTheDocument();
  });

  it("muestra el sello 'Cancelado' cuando el status es cancelado", () => {
    render(<Ticket order={makeOrder({ status: "cancelado" })} />);

    expect(screen.getByText("Cancelado")).toBeInTheDocument();
    expect(screen.getByText("CANCELADO")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Hacer otro pedido/i })).toBeInTheDocument();
  });

  it("no muestra el CTA de 'hacer otro pedido' mientras el pedido está pendiente", () => {
    render(<Ticket order={makeOrder({ status: "pendiente" })} />);

    expect(screen.queryByRole("link", { name: /Hacer otro pedido/i })).not.toBeInTheDocument();
  });

  it("resuelve el ícono del item contra drinksService.list()", async () => {
    mockedDrinksService.list.mockResolvedValue([
      { id: 1, name: "Fernet con Coca", price: 2500, description: "", vibe: "", flavors: [], iconName: "beer", trending: false, available: true },
    ]);

    render(<Ticket order={makeOrder()} />);

    await waitFor(() => expect(mockedDrinksService.list).toHaveBeenCalled());
  });
});
