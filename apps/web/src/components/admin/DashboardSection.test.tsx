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

  it("no muestra Comparativa (deltas viven en las MetricCards)", () => {
    render(<DashboardSection {...makeProps()} />);
    expect(screen.queryByText("Comparativa")).not.toBeInTheDocument();
    expect(screen.getByText("Tickets Totales")).toBeInTheDocument();
    expect(screen.getByText("Unidades Vendidas")).toBeInTheDocument();
  });

  it("marca charts de mix como bruto", () => {
    render(<DashboardSection {...makeProps()} />);
    expect(screen.getByText("Recaudación bruta")).toBeInTheDocument();
    expect(screen.getByText("Subtotal bruto")).toBeInTheDocument();
    expect(screen.getByText("% sobre facturado bruto")).toBeInTheDocument();
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

    it("muestra la hora real de inicio de la última noche archivada", () => {
      const prevEvent: NightEvent = {
        id: "evt-prev",
        status: "cerrado",
        startedAt: historyEvents[0]!.startedAt,
        orderCounter: 2,
      };
      render(
        <DashboardSection
          {...makeProps({
            event: prevEvent,
            isNightOpen: false,
            historyEvents,
            totals: historyEvents[0]!.totals,
          })}
        />,
      );
      expect(screen.getByText(/Iniciada a las \d{2}:\d{2} hs/)).toBeInTheDocument();
    });
  });

  // B1/B2: el subtítulo de las tarjetas y el pie del dashboard mentían cuando
  // no había historial — decían "Sin noches registradas" con una noche activa
  // vendiendo, e inventaban un "21:00" (epoch 0 formateado) sin ninguna noche.
  describe("sin historial de noches", () => {
    it("con noche en curso, las tarjetas no dicen 'Sin noches registradas'", () => {
      render(<DashboardSection {...makeProps({ historyEvents: [] })} />);

      expect(screen.queryByText("Sin noches registradas")).not.toBeInTheDocument();
      expect(screen.getAllByText("Noche en curso — sin noches previas").length).toBe(3);
    });

    it("con noche en curso muestra su hora de inicio real, no un 21:00 inventado", () => {
      render(<DashboardSection {...makeProps({ historyEvents: [] })} />);

      expect(screen.getByText(/Iniciado a las \d{2}:\d{2} hs/)).toBeInTheDocument();
      expect(screen.queryByText(/Iniciada a las/)).not.toBeInTheDocument();
    });

    it("sin noche activa ni historial no inventa una hora de inicio", () => {
      render(<DashboardSection {...makeProps({ event: null, isNightOpen: false, historyEvents: [] })} />);

      expect(screen.queryByText(/Iniciad[oa] a las/)).not.toBeInTheDocument();
      expect(screen.queryByText("Última Noche Registrada")).not.toBeInTheDocument();
      // Acá sí corresponde el estado vacío honesto.
      expect(screen.getAllByText("Sin noches registradas").length).toBeGreaterThan(0);
    });
  });
});
