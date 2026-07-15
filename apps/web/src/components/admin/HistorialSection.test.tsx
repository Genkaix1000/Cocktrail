import { describe, expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import HistorialSection from "./HistorialSection";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { useTheme } from "@/components/ThemeProvider";
import { exportHistorialPdf } from "@/lib/pdfExport";

import type { EventSummary, EventTotals } from "@cocktrail/shared";

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: vi.fn(),
}));

vi.mock("@/lib/pdfExport", () => ({
  exportHistorialPdf: vi.fn(),
}));

vi.mocked(useTheme).mockReturnValue({
  theme: "bosko",
  useLogoUrl: true,
  logoUrl: "/bosko.webp",
  logoSize: 56,
  textLogoValue: "Bosko",
  textLogoSize: 26,
  isDark: true,
  toggleDark: vi.fn(),
});

// HistorialSection no hace fetch propio: historyEvents/historyLoaded
// siguen viviendo en AdminClient (el shell) porque useAdminAnalytics y
// DashboardSection también dependen de esos datos sin importar qué tab
// está activo. Reutilizamos el hook real vía renderHook en vez de mockear
// a mano sus campos derivados (mismo patrón que DashboardSection.test.tsx).
function computeAnalytics(totals: EventTotals, historyEvents: EventSummary[] = []) {
  const { result } = renderHook(() =>
    useAdminAnalytics(totals, Date.now() - 60 * 60 * 1000, [], historyEvents),
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
    ...overrides,
  };
}

function makeProps(overrides: Partial<Parameters<typeof HistorialSection>[0]> = {}) {
  const historyEvents = overrides.historyEvents ?? [];
  const totals = emptyTotals;

  return {
    analytics: computeAnalytics(totals, historyEvents),
    historyEvents,
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

  it("muestra solo 3 MetricCard (sin Promedio Noche)", () => {
    render(<HistorialSection {...makeProps()} />);
    expect(screen.getByText("Esta Semana")).toBeInTheDocument();
    expect(screen.getByText("Este Mes")).toBeInTheDocument();
    expect(screen.getByText("Total Archivado")).toBeInTheDocument();
    expect(screen.queryByText("Promedio Noche")).not.toBeInTheDocument();
  });

  it("sin noches archivadas, el selector único muestra su propio estado vacío", () => {
    render(<HistorialSection {...makeProps({ historyEvents: [] })} />);
    expect(screen.getByText("Todavía no hay noches archivadas.")).toBeInTheDocument();
  });

  it("renderiza el estado de carga (skeleton) mientras historyLoaded no resolvió", () => {
    const { container } = render(
      <HistorialSection {...makeProps({ historyLoaded: false })} />,
    );
    expect(container.querySelector(".animate-dashboard-in")).not.toBeNull();
    expect(screen.queryByText("Historial de Noches")).not.toBeInTheDocument();
  });

  it("con una noche archivada, el selector único muestra su detalle directo (sin tabla ni popup)", async () => {
    const user = userEvent.setup();
    const night = makeNight();
    const onRedirectToLogs = vi.fn();

    render(
      <HistorialSection
        {...makeProps({ historyEvents: [night], onRedirectToLogs })}
      />,
    );

    expect(screen.getByText("Totales Consolidados del Día")).toBeInTheDocument();
    // "Fernet" aparece 2 veces: la card de Trago Estrella y el detalle de la noche.
    expect(screen.getAllByText("Fernet").length).toBeGreaterThanOrEqual(2);

    const auditButton = screen.getByRole("button", { name: /Ver Auditoría de Tickets/i });
    await user.click(auditButton);

    expect(onRedirectToLogs).toHaveBeenCalledTimes(1);
    expect(onRedirectToLogs).toHaveBeenCalledWith(night.closedAt);
  });

  it("el botón Exportar genera el PDF con los datos del theme y el historial", async () => {
    const user = userEvent.setup();
    const night = makeNight();
    vi.mocked(exportHistorialPdf).mockResolvedValue(undefined);

    render(<HistorialSection {...makeProps({ historyEvents: [night] })} />);

    const button = screen.getByRole("button", { name: /Exportar/i });
    await user.click(button);

    expect(exportHistorialPdf).toHaveBeenCalledExactlyOnceWith({
      historyEvents: [night],
      isBosko: false,
      logoUrl: "/bosko.webp",
      useLogoUrl: true,
      textLogoValue: "Bosko",
    });
  });

  it("muestra un Toast de error si la generación del PDF falla", async () => {
    const user = userEvent.setup();
    const night = makeNight();
    vi.mocked(exportHistorialPdf).mockRejectedValue(new Error("boom"));

    render(<HistorialSection {...makeProps({ historyEvents: [night] })} />);

    await user.click(screen.getByRole("button", { name: /Exportar/i }));

    expect(await screen.findByText("No se pudo generar el PDF. Intentá de nuevo.")).toBeInTheDocument();
  });
});
