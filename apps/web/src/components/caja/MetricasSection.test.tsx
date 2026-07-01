import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import MetricasSection from "./MetricasSection";
import { computeTotals } from "@/lib/totals";

import type { CashSale, NightEvent, Order } from "@cocktrail/shared";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    token: "TKN-1",
    displayNumber: 1,
    items: [{ drinkId: 1, name: "Fernet con Coca", qty: 2, unitPrice: 2500, subtotal: 5000 }],
    total: 5000,
    paymentMethod: "efectivo",
    status: "entregado",
    createdAt: Date.now(),
    createdBy: "cajera1",
    ...overrides,
  };
}

function makeCashSale(overrides: Partial<CashSale> = {}): CashSale {
  return {
    id: "sale-1",
    amount: 3000,
    description: "Venta de barra",
    addedBy: "cajera1",
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeEvent(overrides: Partial<NightEvent> = {}): NightEvent {
  return {
    id: "evt-1",
    status: "activo",
    startedAt: Date.now() - 60 * 60 * 1000,
    orderCounter: 1,
    ...overrides,
  };
}

describe("MetricasSection", () => {
  it("renderiza los 3 widgets de estadísticas con los totales calculados", () => {
    const orders = [makeOrder()];
    const cashSales = [makeCashSale()];
    const totals = computeTotals(orders, cashSales);
    const event = makeEvent();

    render(
      <MetricasSection
        event={event}
        activeNightOrders={orders}
        activeNightCashSales={cashSales}
        totals={totals}
      />,
    );

    expect(screen.getByText("Ticket Promedio")).toBeInTheDocument();
    const drinksWidget = screen.getByText("Tragos Vendidos").closest("div");
    expect(screen.getByText("Hora Pico de Ventas")).toBeInTheDocument();
    // 2 unidades del único item del pedido
    expect(drinksWidget).toHaveTextContent("2");
    expect(drinksWidget).toHaveTextContent("unidades");
  });

  it("muestra guion en la hora pico cuando no hay evento activo", () => {
    const totals = computeTotals([], []);

    render(
      <MetricasSection
        event={null}
        activeNightOrders={[]}
        activeNightCashSales={[]}
        totals={totals}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renderiza el gráfico de facturación por hora", () => {
    const orders = [makeOrder()];
    const totals = computeTotals(orders, []);
    const event = makeEvent();

    render(
      <MetricasSection
        event={event}
        activeNightOrders={orders}
        activeNightCashSales={[]}
        totals={totals}
      />,
    );

    expect(screen.getByText("Facturación por Hora")).toBeInTheDocument();
    expect(screen.getByText("EN VIVO")).toBeInTheDocument();
  });
});
