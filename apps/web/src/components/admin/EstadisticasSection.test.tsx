import { describe, expect, it } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";

import EstadisticasSection from "./EstadisticasSection";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";

import type { CashSale, EventSummary, EventTotals, NightEvent, Order } from "@cocktrail/shared";

// EstadisticasSection no hace fetch propio ni llama useAdminAnalytics: recibe
// analytics ya calculado por prop (mismo hook y mismo patrón que
// DashboardSection — AdminClient lo llama una sola vez). Acá reutilizamos el
// hook real vía renderHook en vez de mockear a mano sus ~30 campos derivados.
function computeAnalytics(
  totals: EventTotals,
  event: NightEvent | null,
  orders: Order[],
  cashSales: CashSale[],
  historyEvents: EventSummary[] = [],
) {
  const { result } = renderHook(() =>
    useAdminAnalytics(totals, event?.startedAt, orders, cashSales, historyEvents),
  );
  return result.current;
}

const emptyTotals: EventTotals = {
  webTotal: 0,
  webCount: 0,
  efectivoTotal: 0,
  efectivoCount: 0,
  qrTotal: 0,
  qrCount: 0,
  debitoTotal: 0,
  debitoCount: 0,
  drinksSold: [],
  total: 0,
};

const baseEvent: NightEvent = {
  id: "evt-1",
  status: "activo",
  startedAt: Date.now() - 60 * 60 * 1000,
  orderCounter: 0,
};

function makeProps(overrides: {
  event?: NightEvent | null;
  orders?: Order[];
  cashSales?: CashSale[];
  totals?: EventTotals;
  historyEvents?: EventSummary[];
  isBosko?: boolean;
  barColorClass?: string;
} = {}) {
  const event = overrides.event !== undefined ? overrides.event : baseEvent;
  const orders = overrides.orders ?? [];
  const cashSales = overrides.cashSales ?? [];
  const totals = overrides.totals ?? emptyTotals;
  const historyEvents = overrides.historyEvents ?? [];

  return {
    analytics: computeAnalytics(totals, event, orders, cashSales, historyEvents),
    totals,
    isBosko: overrides.isBosko ?? false,
    barColorClass: overrides.barColorClass ?? "from-blue/15 to-blue",
  };
}

describe("EstadisticasSection", () => {
  it("renderiza sin crashear con datos mínimos", () => {
    render(<EstadisticasSection {...makeProps()} />);
    expect(screen.getByText("Métricas de Venta")).toBeInTheDocument();
    expect(screen.getByText("Facturación por Hora")).toBeInTheDocument();
    expect(screen.getByText("Ticket Promedio")).toBeInTheDocument();
    expect(screen.getByText("Hora Pico de Ventas")).toBeInTheDocument();
  });

  it("muestra '—' como hora pico cuando no hay ventas", () => {
    render(<EstadisticasSection {...makeProps()} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("muestra el ticket promedio segmentado y la hora pico cuando hay pedidos", () => {
    const totals: EventTotals = {
      ...emptyTotals,
      efectivoTotal: 15000,
      efectivoCount: 3,
      total: 15000,
      drinksSold: [{ drinkId: 1, name: "Fernet", qty: 4, subtotal: 15000 }],
    };
    const orders: Order[] = [
      {
        id: "o1",
        token: "tok1",
        displayNumber: 1,
        items: [{ drinkId: 1, name: "Fernet", qty: 4, unitPrice: 3750, subtotal: 15000 }],
        total: 15000,
        paymentMethod: "efectivo",
        status: "entregado",
        createdAt: Date.now(),
      },
    ];

    render(<EstadisticasSection {...makeProps({ totals, orders })} />);

    expect(screen.getByText("Ticket Promedio")).toBeInTheDocument();
    expect(screen.getAllByText((_, el) => el?.textContent === "$15.000").length).toBeGreaterThan(0);
    // Producto vendido — sección "Revenue by Product" listándolo
    expect(screen.getByText("Fernet")).toBeInTheDocument();
  });
});
