import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import NightComparator from "./NightComparator";
import type { UnifiedNightDay } from "@/lib/analytics";
import type { EventSummary } from "@cocktrail/shared";

function makeSession(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: "session-1",
    status: "cerrado",
    startedAt: Date.now() - 5 * 60 * 60 * 1000,
    closedAt: Date.now(),
    orderCounter: 10,
    orders: [],
    cashSales: [],
    totals: {
      webTotal: 40000,
      webCount: 4,
      efectivoTotal: 60000,
      efectivoCount: 6,
      qrTotal: 0,
      qrCount: 0,
      debitoTotal: 0,
      debitoCount: 0,
      drinksSold: [{ drinkId: 1, name: "Fernet con Coca", qty: 5, subtotal: 25000 }],
      total: 100000,
    },
    ...overrides,
  };
}

function makeNight(overrides: Partial<UnifiedNightDay> = {}): UnifiedNightDay {
  const session = makeSession();
  return {
    dateKey: "5/7/2026",
    monthLabel: "Julio 2026",
    startedAt: session.startedAt,
    closedAt: session.closedAt!,
    sessions: [session],
    orderCounter: session.orderCounter,
    cashSalesCount: session.cashSales.length,
    totals: session.totals,
    ...overrides,
  };
}

const noop = () => {};

describe("NightComparator", () => {
  it("muestra un estado vacío sin noches archivadas", () => {
    render(<NightComparator nights={[]} isBosko={false} onRedirectToLogs={noop} />);
    expect(screen.getByText("Todavía no hay noches archivadas.")).toBeInTheDocument();
  });

  it("con una sola noche, muestra su detalle en vez de pedir una comparación", () => {
    render(<NightComparator nights={[makeNight()]} isBosko={false} onRedirectToLogs={noop} />);
    expect(screen.getByText("Totales Consolidados del Día")).toBeInTheDocument();
    expect(screen.getByText("Detalle de Sesiones Individuales")).toBeInTheDocument();
    expect(screen.getByText("Ver Auditoría de Tickets")).toBeInTheDocument();
  });

  it("llama a onRedirectToLogs con la fecha de la noche al click en Ver Auditoría de Tickets", async () => {
    const user = userEvent.setup();
    const onRedirectToLogs = vi.fn();
    const night = makeNight();
    render(<NightComparator nights={[night]} isBosko={false} onRedirectToLogs={onRedirectToLogs} />);

    await user.click(screen.getByText("Ver Auditoría de Tickets"));
    expect(onRedirectToLogs).toHaveBeenCalledExactlyOnceWith(night.closedAt);
  });

  it("al elegir una 2da noche (Noche B), muestra la comparación con delta", async () => {
    const user = userEvent.setup();
    const nightA = makeNight({ dateKey: "a", closedAt: Date.now() });
    const nightB = makeNight({
      dateKey: "b",
      closedAt: Date.now() - 24 * 60 * 60 * 1000,
      totals: { ...nightA.totals, total: 50000 },
    });
    render(<NightComparator nights={[nightA, nightB]} isBosko={false} onRedirectToLogs={noop} />);

    // Por default (sin elegir B) se ve el detalle de A, no la comparación.
    expect(screen.getByText("Totales Consolidados del Día")).toBeInTheDocument();

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[1]!, "1");

    expect(screen.getByText("Total Facturado")).toBeInTheDocument();
    expect(screen.getByText("$100.000")).toBeInTheDocument();
    expect(screen.getByText("$50.000")).toBeInTheDocument();
    expect(screen.getAllByText("+100%").length).toBeGreaterThan(0);
  });

  it("permite cambiar la noche seleccionada en el selector A", async () => {
    const user = userEvent.setup();
    const nightA = makeNight({ dateKey: "a", closedAt: Date.now() });
    const nightB = makeNight({ dateKey: "b", closedAt: Date.now() - 86400000 });
    const nightC = makeNight({
      dateKey: "c",
      closedAt: Date.now() - 172800000,
      totals: { ...nightA.totals, total: 1000 },
    });
    render(<NightComparator nights={[nightA, nightB, nightC]} isBosko={false} onRedirectToLogs={noop} />);

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0]!, "2");
    expect(screen.getByText("$1.000")).toBeInTheDocument();
  });
});
