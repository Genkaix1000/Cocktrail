import { describe, expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";

import DashboardSection from "./DashboardSection";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";

import type { CashSale, EventSummary, EventTotals, NightEvent, Order } from "@cocktrail/shared";

// DashboardSection no hace fetch propio: todo el estado le llega por props
// (event/orders/cashSales/totals/etc.) y los valores derivados de analytics
// le llegan ya calculados por prop (AdminClient llama useAdminAnalytics una
// sola vez y lo pasa hacia abajo — ver hallazgo de architect-reviewer). Acá
// reutilizamos el hook real vía renderHook en vez de mockear a mano sus ~30
// campos derivados.
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

function makeProps(overrides: Partial<Parameters<typeof DashboardSection>[0]> = {}) {
  const event = overrides.event !== undefined ? overrides.event : baseEvent;
  const orders = (overrides.orders ?? []) as Order[];
  const cashSales = (overrides.cashSales ?? []) as CashSale[];
  const totals = overrides.totals ?? emptyTotals;
  const historyEvents = overrides.historyEvents ?? [];

  return {
    analytics: computeAnalytics(totals, event, orders, cashSales, historyEvents),
    event,
    orders,
    cashSales,
    totals,
    historyEvents,
    systemLogs: [],
    customPaymentBreakdown: [],
    isFirstLoad: false,
    isTabTransitioning: false,
    activeTab: "monitoreo",
    chartMetric: "sales" as const,
    setChartMetric: vi.fn(),
    isBosko: false,
    barColorClass: "from-blue/15 to-blue",
    ...overrides,
  };
}

describe("DashboardSection", () => {
  it("renderiza sin crashear con datos mínimos", () => {
    render(<DashboardSection {...makeProps()} />);
    expect(screen.getByText("Dashboard General")).toBeInTheDocument();
  });

  it("muestra 'sin actividad' cuando no hay logs de sistema", () => {
    render(<DashboardSection {...makeProps({ systemLogs: [] })} />);
    expect(screen.getByText("Sin actividad reciente registrada aún")).toBeInTheDocument();
  });

  it("muestra el total de ventas formateado cuando hay pedidos", () => {
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

    render(<DashboardSection {...makeProps({ totals, orders })} />);

    // El total de ventas ($15.000) aparece dentro del MetricCard "Ventas Totales"
    expect(screen.getByText("Ventas Totales")).toBeInTheDocument();
    expect(screen.getByText("Productos Más Vendidos")).toBeInTheDocument();
    expect(screen.getByText("Fernet")).toBeInTheDocument();
  });

  it("renderiza el estado de carga (skeleton) cuando isFirstLoad es true", () => {
    const { container } = render(<DashboardSection {...makeProps({ isFirstLoad: true })} />);
    expect(container.querySelector(".animate-dashboard-in")).not.toBeNull();
    expect(screen.queryByText("Dashboard General")).not.toBeInTheDocument();
  });
});
