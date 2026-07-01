import { describe, expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HistorialSection from "./HistorialSection";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";

import type { EventSummary, EventTotals } from "@cocktrail/shared";

// HistorialSection no hace fetch propio: historyEvents/loadingHistory/
// historyLoaded siguen viviendo en AdminClient (el shell) porque
// useAdminAnalytics y DashboardSection también dependen de esos datos sin
// importar qué tab está activo — solo el filtrado/orden/paginación
// exclusivos de esta vista se movieron acá. Por eso, igual que
// DashboardSection.test.tsx/EstadisticasSection.test.tsx, reutilizamos el
// hook real vía renderHook en vez de mockear a mano sus ~30 campos
// derivados.
function computeAnalytics(totals: EventTotals, historyEvents: EventSummary[] = []) {
  const { result } = renderHook(() =>
    useAdminAnalytics(totals, Date.now() - 60 * 60 * 1000, [], [], historyEvents),
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

function makeNight(overrides: Partial<EventSummary> = {}): EventSummary {
  const closedAt = overrides.closedAt ?? Date.now();
  return {
    id: "evt-1",
    status: "cerrado",
    startedAt: closedAt - 4 * 60 * 60 * 1000,
    closedAt,
    orderCounter: 5,
    closedBy: "cajera1",
    totals: {
      ...emptyTotals,
      efectivoTotal: 15000,
      efectivoCount: 3,
      total: 15000,
      drinksSold: [{ drinkId: 1, name: "Fernet", qty: 4, subtotal: 15000 }],
    },
    orders: [],
    cashSales: [],
    ...overrides,
  };
}

function makeProps(overrides: Partial<Parameters<typeof HistorialSection>[0]> = {}) {
  const historyEvents = overrides.historyEvents ?? [];
  const totals = emptyTotals;

  return {
    analytics: computeAnalytics(totals, historyEvents),
    historyEvents,
    loadingHistory: false,
    historyLoaded: true,
    isTabTransitioning: false,
    isBosko: false,
    onRedirectToLogs: vi.fn(),
    ...overrides,
  };
}

describe("HistorialSection", () => {
  it("renderiza sin crashear con datos mínimos", () => {
    render(<HistorialSection {...makeProps()} />);
    expect(screen.getByText("Historial de Noches")).toBeInTheDocument();
  });

  it("muestra 'sin noches' cuando el historial está vacío", () => {
    render(<HistorialSection {...makeProps({ historyEvents: [] })} />);
    expect(screen.getByText("Sin noches cerradas todavía.")).toBeInTheDocument();
  });

  it("renderiza el estado de carga (skeleton) mientras loadingHistory/historyLoaded no resolvieron", () => {
    const { container } = render(
      <HistorialSection {...makeProps({ historyLoaded: false })} />,
    );
    expect(container.querySelector(".animate-dashboard-in")).not.toBeNull();
    expect(screen.queryByText("Historial de Noches")).not.toBeInTheDocument();
  });

  it("muestra una noche archivada y dispara onRedirectToLogs al pedir la auditoría", async () => {
    const user = userEvent.setup();
    const night = makeNight();
    const onRedirectToLogs = vi.fn();

    const { container } = render(
      <HistorialSection
        {...makeProps({ historyEvents: [night], onRedirectToLogs })}
      />,
    );

    // La noche aparece listada en la tabla de detalle
    const row = container.querySelector("tbody tr");
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain("$15.000");

    // Click en la fila abre el popup de detalle del día
    await user.click(row as Element);

    const auditButton = screen.getByRole("button", { name: /Ver Auditoría de Tickets/i });
    await user.click(auditButton);

    expect(onRedirectToLogs).toHaveBeenCalledTimes(1);
    expect(onRedirectToLogs).toHaveBeenCalledWith(night.closedAt);
  });
});
