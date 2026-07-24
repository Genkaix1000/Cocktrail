import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendingUp } from "lucide-react";

import MetricCard from "./MetricCard";

describe("MetricCard", () => {
  it("renderiza label y valor", () => {
    render(
      <MetricCard
        label="Ventas Totales"
        value={15000}
        isCurrency
        delta={undefined}
        icon={TrendingUp}
      />,
    );
    expect(screen.getByText("Ventas Totales")).toBeInTheDocument();
    expect(screen.getByText("15.000")).toBeInTheDocument();
  });

  it("variante featured sigue mostrando el label", () => {
    const { container } = render(
      <MetricCard
        label="Ventas Totales"
        value={15000}
        isCurrency
        featured
        delta={{ label: "+10%", direction: "up", value: 10, pct: 10 }}
        icon={TrendingUp}
      />,
    );
    expect(screen.getByText("Ventas Totales")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("bg-[var(--accent-primary)]");
  });

  it("muestra pill de delta cuando hay delta", () => {
    render(
      <MetricCard
        label="Tickets"
        value={12}
        delta={{ label: "+2", direction: "up", value: 2, pct: 20 }}
        icon={TrendingUp}
        subtitle="vs. Última Noche"
      />,
    );
    expect(screen.getByText(/\+2/)).toBeInTheDocument();
    expect(screen.getByText(/Última Noche/)).toBeInTheDocument();
  });
});
