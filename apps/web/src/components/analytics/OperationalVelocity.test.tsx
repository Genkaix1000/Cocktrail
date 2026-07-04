import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import OperationalVelocity from "./OperationalVelocity";
import type { OperationalVelocity as OperationalVelocityType } from "@/lib/analytics";

describe("OperationalVelocity", () => {
  it("renderiza el tiempo total promedio formateado", () => {
    const velocity: OperationalVelocityType = {
      avgReactionTime: 30_000,
      avgPrepTime: 120_000,
      avgWaitTime: 60_000,
      avgTotalTime: 210_000,
    };
    render(<OperationalVelocity velocity={velocity} isBosko={false} />);
    expect(screen.getByText("Tiempo total promedio")).toBeInTheDocument();
    expect(screen.getAllByText("3m 30s").length).toBeGreaterThan(0);
  });

  it("muestra '—' cuando no hay tiempo total (sin canjes aún)", () => {
    const velocity: OperationalVelocityType = {
      avgReactionTime: null,
      avgPrepTime: null,
      avgWaitTime: null,
      avgTotalTime: null,
    };
    render(<OperationalVelocity velocity={velocity} isBosko={false} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
