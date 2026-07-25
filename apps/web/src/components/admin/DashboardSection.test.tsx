import { describe, expect, it } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import DashboardSection from "./DashboardSection";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";

import type { EventSummary, EventTotals, NightEvent, Order } from "@cocktrail/shared";

// DashboardSection no hace fetch propio: todo el estado le llega por props
// (event/orders/totals/etc.) y los valores derivados de analytics le llegan
// ya calculados por prop (AdminClient llama useAdminAnalytics una sola vez y
// lo pasa hacia abajo — ver hallazgo de architect-reviewer). Acá reutilizamos
// el hook real vía renderHook en vez de mockear a mano sus ~30 campos
// derivados.
function computeAnalytics(
  totals: EventTotals,
  event: NightEvent | null,
  orders: Order[],
  historyEvents: EventSummary[] = [],
) {
  const { result } = renderHook(() =>
    useAdminAnalytics(totals, event?.startedAt, orders, historyEvents),
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
  totals?: EventTotals;
  historyEvents?: EventSummary[];
  customPaymentBreakdown?: ComponentProps<typeof DashboardSection>["customPaymentBreakdown"];
  isFirstLoad?: boolean;
  isTabTransitioning?: boolean;
  activeTab?: string;
  isNightOpen?: boolean;
} = {}) {
  const event = overrides.event !== undefined ? overrides.event : baseEvent;
  const orders = (overrides.orders ?? []) as Order[];
  const totals = overrides.totals ?? emptyTotals;
  const historyEvents = overrides.historyEvents ?? [];
  const isNightOpen = overrides.isNightOpen ?? event?.status === "activo";

  const { event: _, orders: __, ...componentProps } = overrides;

  return {
    analytics: computeAnalytics(totals, event, orders, historyEvents),
    totals,
    historyEvents,
    customPaymentBreakdown: [],
    isFirstLoad: false,
    isTabTransitioning: false,
    activeTab: "monitoreo",
    ...componentProps,
    isNightOpen,
  };
}

describe("DashboardSection", () => {
  it("renderiza sin crashear con datos mínimos", () => {
    render(<DashboardSection {...makeProps()} />);
    expect(screen.getByText("Dashboard General")).toBeInTheDocument();
  });

  it("no muestra Ticket Promedio ni Actividad Reciente (fusión con Estadísticas)", () => {
    render(<DashboardSection {...makeProps()} />);
    expect(screen.queryByText("Ticket Promedio")).not.toBeInTheDocument();
    expect(screen.queryByText("Actividad Reciente")).not.toBeInTheDocument();
    expect(screen.queryByText(/Insights|Alertas/i)).not.toBeInTheDocument();
  });

  it("muestra Hora Pico de Ventas (portado de la vista Estadísticas)", () => {
    render(<DashboardSection {...makeProps()} />);
    expect(screen.getByText("Hora Pico de Ventas")).toBeInTheDocument();
  });

  it("Ventas por Hora no tiene toggle Costo/Vasos y no muestra 'uds'", () => {
    render(<DashboardSection {...makeProps()} />);
    expect(screen.getByText("Ventas por Hora")).toBeInTheDocument();
    expect(screen.queryByText("Costo")).not.toBeInTheDocument();
    expect(screen.queryByText("Vasos")).not.toBeInTheDocument();
    expect(screen.queryByText(/\buds\b/)).not.toBeInTheDocument();
  });

  it("muestra la Comparativa con 3 filas, sin Ticket Promedio", () => {
    render(<DashboardSection {...makeProps()} />);
    expect(screen.getByText("Comparativa")).toBeInTheDocument();
    expect(screen.getByText("Ventas")).toBeInTheDocument();
    expect(screen.getByText("Tickets")).toBeInTheDocument();
    expect(screen.getByText("Unidades")).toBeInTheDocument();
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
    expect(screen.queryByText("Ver todos")).not.toBeInTheDocument();
  });

  it("renderiza el estado de carga (skeleton) cuando isFirstLoad es true", () => {
    const { container } = render(<DashboardSection {...makeProps({ isFirstLoad: true })} />);
    expect(container.querySelector(".animate-dashboard-in")).not.toBeNull();
    expect(screen.queryByText("Dashboard General")).not.toBeInTheDocument();
  });

  describe("sin noche abierta", () => {
    const historyEvents: EventSummary[] = [
      {
        id: "evt-prev",
        status: "cerrado",
        startedAt: Date.now() - 5 * 60 * 60 * 1000,
        closedAt: Date.now() - 60 * 60 * 1000,
        orderCounter: 2,
        totals: {
          ...emptyTotals,
          efectivoTotal: 18801,
          efectivoCount: 2,
          total: 18801,
          drinksSold: [{ drinkId: 1, name: "Vodka con Speed", qty: 1, subtotal: 5000 }],
        },
        orders: [],
      },
    ];

    it("no muestra la card Comparativa", () => {
      render(
        <DashboardSection
          {...makeProps({ event: null, isNightOpen: false, historyEvents, totals: historyEvents[0]!.totals })}
        />,
      );
      expect(screen.queryByText("Comparativa")).not.toBeInTheDocument();
    });

    it("no muestra delta ni 'EN VIVO', muestra la fecha de la última noche", () => {
      render(
        <DashboardSection
          {...makeProps({ event: null, isNightOpen: false, historyEvents, totals: historyEvents[0]!.totals })}
        />,
      );
      expect(screen.queryByText("EN VIVO")).not.toBeInTheDocument();
      expect(screen.queryByText(/^↑|^↓/)).not.toBeInTheDocument();
      expect(screen.getAllByText(/Noche del/).length).toBeGreaterThan(0);
    });
  });
});
