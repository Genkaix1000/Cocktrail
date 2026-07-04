import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import NightEvolutionChart from "./NightEvolutionChart";
import type { NightPoint } from "@/lib/analytics";

function makePoint(overrides: Partial<NightPoint> = {}): NightPoint {
  return {
    id: "night-1",
    date: "Vie 6 jun",
    total: 100000,
    web: 40000,
    efectivo: 60000,
    orderCount: 20,
    closedAt: Date.now(),
    ...overrides,
  };
}

describe("NightEvolutionChart", () => {
  it("muestra el estado vacío sin noches", () => {
    render(<NightEvolutionChart points={[]} movingAvg={[]} isBosko={false} />);
    expect(screen.getByText("Sin datos de noches anteriores")).toBeInTheDocument();
  });

  it("renderiza el gráfico con la cantidad de noches en el subtítulo", () => {
    const points = [makePoint({ id: "n1" }), makePoint({ id: "n2", date: "Sáb 7 jun" })];
    render(<NightEvolutionChart points={points} movingAvg={[null, 100000]} isBosko={false} />);
    expect(screen.getByText("Últimas 2 noches con media móvil")).toBeInTheDocument();
  });
});
