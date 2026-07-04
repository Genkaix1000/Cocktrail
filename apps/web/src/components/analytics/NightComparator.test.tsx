import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import NightComparator from "./NightComparator";
import type { EventSummary } from "@cocktrail/shared";

function makeNight(overrides: Partial<EventSummary> = {}): EventSummary {
  const startedAt = Date.now() - 5 * 60 * 60 * 1000;
  const closedAt = Date.now();
  return {
    id: "night-1",
    status: "cerrado",
    startedAt,
    closedAt,
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

describe("NightComparator", () => {
  it("pide al menos 2 noches cerradas para comparar", () => {
    render(<NightComparator nights={[makeNight()]} isBosko={false} />);
    expect(
      screen.getByText("Se necesitan al menos 2 noches cerradas para comparar.")
    ).toBeInTheDocument();
  });

  it("compara las 2 noches más recientes por default y muestra el delta", () => {
    const nightA = makeNight({ id: "night-1", closedAt: Date.now() });
    const nightB = makeNight({
      id: "night-2",
      closedAt: Date.now() - 24 * 60 * 60 * 1000,
      totals: { ...nightA.totals, total: 50000 },
    });
    render(<NightComparator nights={[nightA, nightB]} isBosko={false} />);
    expect(screen.getByText("Total Facturado")).toBeInTheDocument();
    expect(screen.getByText("$100.000")).toBeInTheDocument();
    expect(screen.getByText("$50.000")).toBeInTheDocument();
    expect(screen.getAllByText("+100%").length).toBeGreaterThan(0);
  });

  it("permite cambiar la noche seleccionada en el selector A", async () => {
    const user = userEvent.setup();
    const nightA = makeNight({ id: "night-1", closedAt: Date.now() });
    const nightB = makeNight({ id: "night-2", closedAt: Date.now() - 86400000 });
    const nightC = makeNight({ id: "night-3", closedAt: Date.now() - 172800000, totals: { ...nightA.totals, total: 1000 } });
    render(<NightComparator nights={[nightA, nightB, nightC]} isBosko={false} />);

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0]!, "2");
    expect(screen.getByText("$1.000")).toBeInTheDocument();
  });
});
